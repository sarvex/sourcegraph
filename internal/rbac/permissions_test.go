package rbac

import (
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/stretchr/testify/assert"

	"github.com/sourcegraph/sourcegraph/internal/database"
	"github.com/sourcegraph/sourcegraph/internal/types"
)

func TestComparePermissions(t *testing.T) {
	dbPerms := []*types.Permission{
		{ID: 1, Namespace: "TEST-NAMESPACE", Action: "READ"},
		{ID: 2, Namespace: "TEST-NAMESPACE", Action: "WRITE"},
		{ID: 3, Namespace: "TEST-NAMESPACE-2", Action: "READ"},
		{ID: 4, Namespace: "TEST-NAMESPACE-2", Action: "WRITE"},
		{ID: 5, Namespace: "TEST-NAMESPACE-3", Action: "READ"},
	}

	t.Run("no changes to permissions", func(t *testing.T) {
		schemaPerms := Schema{
			Namespaces: []Namespace{
				{Name: "TEST-NAMESPACE", Actions: []string{"READ", "WRITE"}},
				{Name: "TEST-NAMESPACE-2", Actions: []string{"READ", "WRITE"}},
				{Name: "TEST-NAMESPACE-3", Actions: []string{"READ"}},
			},
		}

		added, deleted := ComparePermissions(dbPerms, schemaPerms)

		assert.Len(t, added, 0)
		assert.Len(t, deleted, 0)
	})

	t.Run("permissions deleted", func(t *testing.T) {
		schemaPerms := Schema{
			Namespaces: []Namespace{
				{Name: "TEST-NAMESPACE", Actions: []string{"READ", "WRITE"}},
				{Name: "TEST-NAMESPACE-2", Actions: []string{"READ"}},
			},
		}

		want := []database.DeletePermissionOpts{
			{ID: int32(4)},
			{ID: int32(5)},
		}

		added, deleted := ComparePermissions(dbPerms, schemaPerms)

		assert.Len(t, added, 0)
		assert.Len(t, deleted, 2)
		if diff := cmp.Diff(want, deleted, cmpopts.SortSlices(sortDeletePermissionOptSlice)); diff != "" {
			t.Error(diff)
		}
	})

	t.Run("permissions added", func(t *testing.T) {
		schemaPerms := Schema{
			Namespaces: []Namespace{
				{Name: "TEST-NAMESPACE", Actions: []string{"READ", "WRITE"}},
				{Name: "TEST-NAMESPACE-2", Actions: []string{"READ", "WRITE", "EXECUTE"}},
				{Name: "TEST-NAMESPACE-3", Actions: []string{"READ", "WRITE"}},
				{Name: "TEST-NAMESPACE-4", Actions: []string{"READ", "WRITE"}},
			},
		}

		want := []database.CreatePermissionOpts{
			{Namespace: "TEST-NAMESPACE-2", Action: "EXECUTE"},
			{Namespace: "TEST-NAMESPACE-3", Action: "WRITE"},
			{Namespace: "TEST-NAMESPACE-4", Action: "READ"},
			{Namespace: "TEST-NAMESPACE-4", Action: "WRITE"},
		}

		added, deleted := ComparePermissions(dbPerms, schemaPerms)

		assert.Len(t, added, 4)
		assert.Len(t, deleted, 0)
		if diff := cmp.Diff(want, added, cmpopts.SortSlices(sortCreatePermissionOptSlice)); diff != "" {
			t.Error(diff)
		}
	})
}

func sortDeletePermissionOptSlice(a, b database.DeletePermissionOpts) bool { return a.ID < b.ID }
func sortCreatePermissionOptSlice(a, b database.CreatePermissionOpts) bool {
	return a.Action < a.Action
}
