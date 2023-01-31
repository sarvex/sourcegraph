package graphqlbackend

import (
	"context"
	"fmt"

	"github.com/graph-gophers/graphql-go"
	"github.com/graph-gophers/graphql-go/relay"

	"github.com/sourcegraph/sourcegraph/cmd/frontend/graphqlbackend/graphqlutil"
	"github.com/sourcegraph/sourcegraph/internal/actor"
	"github.com/sourcegraph/sourcegraph/internal/auth"
	"github.com/sourcegraph/sourcegraph/internal/database"
	"github.com/sourcegraph/sourcegraph/internal/errcode"
	"github.com/sourcegraph/sourcegraph/internal/types"
	"github.com/sourcegraph/sourcegraph/lib/errors"
)

type ListTeamsArgs struct {
	First  *int32
	After  *string
	Search *string
}

type teamConnectionResolver struct{}

func (r *teamConnectionResolver) TotalCount(args *struct{ CountDeeplyNestedTeams bool }) int32 {
	return 0
}
func (r *teamConnectionResolver) PageInfo() *graphqlutil.PageInfo {
	return graphqlutil.HasNextPage(false)
}
func (r *teamConnectionResolver) Nodes() []*teamResolver { return nil }

type teamResolver struct {
	team    *types.Team
	teamsDb database.TeamStore
}

func (r *teamResolver) ID() graphql.ID {
	return relay.MarshalID("Team", r.team.ID)
}
func (r *teamResolver) Name() string { return r.team.Name }
func (r *teamResolver) URL() string  { return "" }
func (r *teamResolver) DisplayName() *string {
	if r.team.DisplayName == "" {
		return nil
	}
	return &r.team.DisplayName
}
func (r *teamResolver) Readonly() bool { return r.team.ReadOnly }
func (r *teamResolver) ParentTeam(ctx context.Context) (*teamResolver, error) {
	if r.team.ParentTeamID == 0 {
		return nil, nil
	}
	parentTeam, err := r.teamsDb.GetTeamByID(ctx, r.team.ParentTeamID)
	if err != nil {
		return nil, err
	}
	return &teamResolver{team: parentTeam, teamsDb: r.teamsDb}, nil
}
func (r *teamResolver) ViewerCanAdminister() bool { return false }
func (r *teamResolver) Members(args *ListTeamsArgs) *teamMemberConnection {
	return &teamMemberConnection{}
}
func (r *teamResolver) ChildTeams(args *ListTeamsArgs) *teamConnectionResolver {
	return &teamConnectionResolver{}
}

type teamMemberConnection struct{}

func (r *teamMemberConnection) TotalCount(args *struct{ CountDeeplyNestedTeamMembers bool }) int32 {
	return 0
}
func (r *teamMemberConnection) PageInfo() *graphqlutil.PageInfo {
	return graphqlutil.HasNextPage(false)
}
func (r *teamMemberConnection) Nodes() []*UserResolver {
	return nil
}

type CreateTeamArgs struct {
	Name           string
	DisplayName    *string
	ReadOnly       bool
	ParentTeam     *graphql.ID
	ParentTeamName *string
}

func (r *schemaResolver) CreateTeam(ctx context.Context, args *CreateTeamArgs) (*teamResolver, error) {
	// 🚨 SECURITY: For now we only allow site admins to create teams.
	if err := auth.CheckCurrentUserIsSiteAdmin(ctx, r.db); err != nil {
		return nil, errors.New("only site admins can create teams")
	}
	teams := r.db.Teams()
	var t types.Team
	t.Name = args.Name
	if args.DisplayName != nil {
		t.DisplayName = *args.DisplayName
	}
	t.ReadOnly = args.ReadOnly
	if args.ParentTeam != nil && args.ParentTeamName != nil {
		return nil, errors.New("must specify at most one: ParentTeam or ParentTeamName")
	}
	if args.ParentTeam != nil {
		if err := relay.UnmarshalSpec(*args.ParentTeam, &t.ParentTeamID); err != nil {
			return nil, errors.Wrapf(err, "Cannot interpret ParentTeam ID: %q", *args.ParentTeam)
		}
		if _, err := teams.GetTeamByID(ctx, t.ParentTeamID); errcode.IsNotFound(err) {
			return nil, errors.Wrapf(err, "ParentTeam ID=%d not found", t.ParentTeamID)
		}
	}
	if args.ParentTeamName != nil {
		parentTeam, err := teams.GetTeamByName(ctx, *args.ParentTeamName)
		if errcode.IsNotFound(err) {
			return nil, errors.Wrapf(err, "ParentTeam name=%q not found", *args.ParentTeamName)
		}
		t.ParentTeamID = parentTeam.ID
	}
	t.CreatorID = actor.FromContext(ctx).UID
	if err := teams.CreateTeam(ctx, &t); err != nil {
		return nil, err
	}
	return &teamResolver{team: &t, teamsDb: teams}, nil
}

type UpdateTeamArgs struct {
	ID             *graphql.ID
	Name           *string
	DisplayName    *string
	ParentTeam     *graphql.ID
	ParentTeamName *string
}

func (r *schemaResolver) UpdateTeam(args *UpdateTeamArgs) *teamResolver {
	return &teamResolver{}
}

type DeleteTeamArgs struct {
	ID   *graphql.ID
	Name *string
}

func (r *schemaResolver) DeleteTeam(args *DeleteTeamArgs) *EmptyResponse {
	return &EmptyResponse{}
}

type TeamMembersArgs struct {
	Team     *graphql.ID
	TeamName *string
	Members  []TeamMemberInput
}

type TeamMemberInput struct {
	ID                         *graphql.ID
	Username                   *string
	Email                      *string
	ExternalAccountServiceID   *string
	ExternalAccountServiceType *string
	ExternalAccountAccountID   *string
	ExternalAccountLogin       *string
}

func (r *schemaResolver) AddTeamMembers(ctx context.Context, args *TeamMembersArgs) (*teamResolver, error) {
	var team *types.Team
	if args.Team != nil {
		var id int32
		err := relay.UnmarshalSpec(*args.Team, id)
		if err != nil {
			return nil, err
		}
		team, err = r.db.Teams().GetTeamByID(ctx, id)
		if err != nil {
			return nil, err
		}
	} else if args.TeamName != nil {
		var err error
		team, err = r.db.Teams().GetTeamByName(ctx, *args.TeamName)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, errors.New("must specify team name or team id")
	}

	fmt.Printf("Arguments for query: %v\n", args.Members)

	users, err := usersForTeamMembers(ctx, r.db, args.Members)
	if err != nil {
		return nil, err
	}
	ms := make([]*types.TeamMember, 0, len(users))
	for _, u := range users {
		ms = append(ms, &types.TeamMember{
			UserID: u.ID,
			TeamID: team.ID,
		})
	}
	if err := r.db.Teams().CreateTeamMember(ctx, ms...); err != nil {
		return nil, err
	}

	return &teamResolver{team: team, teamsDb: r.db.Teams()}, nil
}

func (r *schemaResolver) SetTeamMembers(args *TeamMembersArgs) *teamResolver {
	return &teamResolver{}
}

func (r *schemaResolver) RemoveTeamMembers(args *TeamMembersArgs) *teamResolver {
	return &teamResolver{}
}

func usersForTeamMembers(ctx context.Context, db database.DB, members []TeamMemberInput) (users []*types.User, err error) {
	// First, look at ID.
	ids := []int32{}
	for _, m := range members {
		if m.ID != nil {
			id, err := UnmarshalUserID(*m.ID)
			if err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
	}
	if len(ids) > 0 {
		users, err = db.Users().List(ctx, &database.UsersListOptions{UserIDs: ids})
		if err != nil {
			return nil, err
		}
		if len(users) != len(ids) {
			return nil, errors.New("not all user IDs returned a result")
		}
	}
	// Now, look at all that have username set.
	usernames := []string{}
	for _, m := range members {
		if m.ID != nil {
			continue
		}
		if m.Username != nil {
			usernames = append(usernames, *m.Username)
		}
	}
	if len(usernames) > 0 {
		us, err := db.Users().List(ctx, &database.UsersListOptions{Usernames: usernames})
		if err != nil {
			return nil, err
		}
		if len(us) != len(ids) {
			return nil, errors.New("not all usernames returned a result")
		}
		users = append(users, us...)
	}
	// Next up: Email.
	for _, m := range members {
		if m.ID != nil {
			continue
		}
		if m.Username != nil {
			continue
		}
		if m.Email != nil {
			user, err := db.Users().GetByVerifiedEmail(ctx, *m.Email)
			if err != nil {
				return nil, err
			}
			users = append(users, user)
		}
	}
	// Next up: ExternalAccount.
	for _, m := range members {
		if m.ID != nil {
			continue
		}
		if m.Username != nil {
			continue
		}
		if m.Email != nil {
			continue
		}
		if m.ExternalAccountServiceID == nil || m.ExternalAccountServiceType == nil {
			return nil, errors.New("must specify at least one option for each member")
		}
		eas, err := db.UserExternalAccounts().List(ctx, database.ExternalAccountsListOptions{
			ServiceType: *m.ExternalAccountServiceType,
			ServiceID:   *m.ExternalAccountServiceID,
		})
		if err != nil {
			return nil, err
		}
		if len(eas) == 0 {
			return nil, errors.New("no external account entry for user")
		}
		found := false
		for _, ea := range eas {
			if m.ExternalAccountAccountID != nil {
				if ea.AccountID == *m.ExternalAccountAccountID {
					u, err := db.Users().GetByID(ctx, ea.UserID)
					if err != nil {
						return nil, err
					}
					users = append(users, u)
					found = true
					break
				}
				continue
			}
			if m.ExternalAccountLogin != nil {
				if ea.PublicAccountData.Login == nil {
					continue
				}
				if *ea.PublicAccountData.Login == *m.ExternalAccountAccountID {
					u, err := db.Users().GetByID(ctx, ea.UserID)
					if err != nil {
						return nil, err
					}
					users = append(users, u)
					found = true
					break
				}
				continue
			}
			return nil, errors.New("must set either accountID or login for external account")
		}
		if !found {
			// no login data for account :shrug:.
			// return nil, errors.New("matching account not found")
		}
	}
	return users, nil
}
