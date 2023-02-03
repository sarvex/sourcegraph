package database

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/graph-gophers/graphql-go"
	"github.com/graph-gophers/graphql-go/relay"
	"github.com/keegancsmith/sqlf"
)

// LimitOffset specifies SQL LIMIT and OFFSET counts. A pointer to it is
// typically embedded in other options structs that need to perform SQL queries
// with LIMIT and OFFSET.
type LimitOffset struct {
	Limit  int // SQL LIMIT count
	Offset int // SQL OFFSET count
}

// SQL returns the SQL query fragment ("LIMIT %d OFFSET %d") for use in SQL
// queries.
func (o *LimitOffset) SQL() *sqlf.Query {
	if o == nil {
		return &sqlf.Query{}
	}
	return sqlf.Sprintf("LIMIT %d OFFSET %d", o.Limit, o.Offset)
}

// maybeQueryIsID returns a possible database ID if query looks like either a
// database ID or a graphql.ID.
func maybeQueryIsID(query string) (int32, bool) {
	// Query looks like an ID
	if id, err := strconv.ParseInt(query, 10, 32); err == nil {
		return int32(id), true
	}

	// Query looks like a GraphQL ID
	var id int32
	err := relay.UnmarshalSpec(graphql.ID(query), &id)
	return id, err == nil
}

type QueryArgs struct {
	Where *sqlf.Query
	Order *sqlf.Query
	Limit *sqlf.Query
}

func (a *QueryArgs) AppendWhereToQuery(query *sqlf.Query) *sqlf.Query {
	if a.Where == nil {
		return query
	}

	return sqlf.Sprintf("%v WHERE %v", query, a.Where)
}

func (a *QueryArgs) AppendOrderToQuery(query *sqlf.Query) *sqlf.Query {
	if a.Order == nil {
		return query
	}

	return sqlf.Sprintf("%v ORDER BY %v", query, a.Order)
}

func (a *QueryArgs) AppendLimitToQuery(query *sqlf.Query) *sqlf.Query {
	if a.Limit == nil {
		return query
	}

	return sqlf.Sprintf("%v %v", query, a.Limit)
}

func (a *QueryArgs) AppendAllToQuery(query *sqlf.Query) *sqlf.Query {
	query = a.AppendWhereToQuery(query)
	query = a.AppendOrderToQuery(query)
	query = a.AppendLimitToQuery(query)

	return query
}

type OrderBy []OrderByOption

func (o OrderBy) Columns() []string {
	columns := []string{}

	for _, orderOption := range o {
		columns = append(columns, orderOption.Field)
	}

	return columns
}

func (o OrderBy) SQL(ascending bool) *sqlf.Query {
	columns := []*sqlf.Query{}

	for _, orderOption := range o {
		columns = append(columns, orderOption.SQL(ascending))
	}

	return sqlf.Join(columns, ", ")
}

type OrderByOption struct {
	Field string
	Nulls string
}

func (o OrderByOption) SQL(ascending bool) *sqlf.Query {
	var sb strings.Builder

	sb.WriteString(o.Field)

	if ascending {
		sb.WriteString(" ASC")
	} else {
		sb.WriteString(" DESC")
	}

	if o.Nulls == "FIRST" || o.Nulls == "LAST" {
		sb.WriteString(" NULLS " + o.Nulls)
	}

	return sqlf.Sprintf(sb.String())
}

type PaginationArgs struct {
	First  *int
	Last   *int
	After  *string
	Before *string

	// TODO(naman): explain default
	OrderBy   OrderBy
	Ascending bool
}

// SQL converts PaginationArgs into a set of sqlf.Query parameters which can be
// directly used in an SQL query.
//
// Note: if OrderBy has 0 fields, "id" field is added by default. If OrderBy has
// more than 1 fields and After/Before are used, then only the first field of
// OrderBy is placed in a WHERE clause of the SQL query.
func (p *PaginationArgs) SQL() *QueryArgs {
	queryArgs := &QueryArgs{}

	var conditions []*sqlf.Query

	orderBy := p.OrderBy
	if len(orderBy) < 1 {
		orderBy = OrderBy{{Field: "id"}}
	}

	// We always have at least 1 column here.
	orderByColumn := orderBy[0]

	if p.After != nil {
		condition := fmt.Sprintf("%s >", orderByColumn.Field)
		if !p.Ascending {
			condition = fmt.Sprintf("%s <", orderByColumn.Field)
		}

		conditions = append(conditions, sqlf.Sprintf(fmt.Sprintf("%s %s", condition, *p.After)))
	}
	if p.Before != nil {
		condition := fmt.Sprintf("%s <", orderByColumn.Field)
		if !p.Ascending {
			condition = fmt.Sprintf("%s >", orderByColumn.Field)
		}

		conditions = append(conditions, sqlf.Sprintf(fmt.Sprintf("%s %s", condition, *p.Before)))
	}

	if len(conditions) > 0 {
		queryArgs.Where = sqlf.Sprintf("%v", sqlf.Join(conditions, "AND "))
	}

	if p.First != nil {
		queryArgs.Order = orderBy.SQL(p.Ascending)
		queryArgs.Limit = sqlf.Sprintf("LIMIT %d", *p.First)
	} else if p.Last != nil {
		queryArgs.Order = orderBy.SQL(!p.Ascending)
		queryArgs.Limit = sqlf.Sprintf("LIMIT %d", *p.Last)
	} else {
		queryArgs.Order = orderBy.SQL(p.Ascending)
	}

	return queryArgs
}

func copyPtr[T any](n *T) *T {
	if n == nil {
		return nil
	}

	c := *n
	return &c
}

// Clone (aka deepcopy) returns a new PaginationArgs object with the same values
// as "p".
func (p *PaginationArgs) Clone() *PaginationArgs {
	return &PaginationArgs{
		First:  copyPtr(p.First),
		Last:   copyPtr(p.Last),
		After:  copyPtr(p.After),
		Before: copyPtr(p.Before),
	}
}
