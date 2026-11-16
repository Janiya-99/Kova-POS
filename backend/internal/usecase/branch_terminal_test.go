package usecase

import (
	"testing"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/google/uuid"
)

func TestIsMultiBranchRole(t *testing.T) {
	if !IsMultiBranchRole("SuperAdmin") || !IsMultiBranchRole("BusinessOwner") {
		t.Fatalf("expected SuperAdmin and BusinessOwner to be multi-branch roles")
	}
	for _, singleRole := range []string{"", "Cashier", "BranchManager", "Accountant", "InventoryController", "StoreSupervisor"} {
		if IsMultiBranchRole(singleRole) {
			t.Fatalf("expected role %q to be single-branch only", singleRole)
		}
	}
}

func TestFilterMultiBranchPermissions(t *testing.T) {
	raw := []string{"analytics:view", "branches:view", "branches:switch", "branches:manage", "pos:view"}

	ownerPerms := filterMultiBranchPermissions("BusinessOwner", raw)
	if len(ownerPerms) != len(raw) {
		t.Fatalf("expected BusinessOwner to retain all permissions, got %v", ownerPerms)
	}

	for _, role := range []string{"Cashier", "BranchManager", "Accountant", "InventoryController"} {
		filtered := filterMultiBranchPermissions(role, raw)
		for _, p := range filtered {
			if p == "branches:switch" || p == "branches:manage" {
				t.Fatalf("role %q must not retain multi-branch permission %q", role, p)
			}
		}
		if len(filtered) != 3 {
			t.Fatalf("expected 3 safe permissions for %q, got %v", role, filtered)
		}
	}
}

func TestValidateUserBranchAssignment(t *testing.T) {
	branchA := uuid.New()
	nilID := uuid.Nil

	if err := ValidateUserBranchAssignment("BusinessOwner", nil); err != nil {
		t.Fatalf("BusinessOwner with All Branches (nil) should be allowed, got: %v", err)
	}
	if err := ValidateUserBranchAssignment("SuperAdmin", &nilID); err != nil {
		t.Fatalf("SuperAdmin with uuid.Nil should be allowed, got: %v", err)
	}
	if err := ValidateUserBranchAssignment("BusinessOwner", &branchA); err != nil {
		t.Fatalf("BusinessOwner pinned to specific branch should be allowed, got: %v", err)
	}

	for _, singleRole := range []string{"Cashier", "BranchManager", "Accountant", "InventoryController", "CustomSupervisor"} {
		if err := ValidateUserBranchAssignment(singleRole, nil); err == nil {
			t.Fatalf("expected error assigning All Branches (nil) to single-branch role %q", singleRole)
		}
		if err := ValidateUserBranchAssignment(singleRole, &nilID); err == nil {
			t.Fatalf("expected error assigning uuid.Nil branch to single-branch role %q", singleRole)
		}
		if err := ValidateUserBranchAssignment(singleRole, &branchA); err != nil {
			t.Fatalf("expected single-branch role %q with valid branch to succeed, got: %v", singleRole, err)
		}
	}
}

func TestResolveScopedBranchID(t *testing.T) {
	branchA := uuid.New()
	branchB := uuid.New()

	ownerTC := domain.TenantContext{RoleCode: "BusinessOwner", BranchID: branchA}
	if got, err := ResolveScopedBranchID(ownerTC, uuid.Nil); err != nil || got != uuid.Nil {
		t.Fatalf("owner requesting All Branches failed: got=%s err=%v", got, err)
	}
	if got, err := ResolveScopedBranchID(ownerTC, branchB); err != nil || got != branchB {
		t.Fatalf("owner requesting branch B failed: got=%s err=%v", got, err)
	}

	cashierTC := domain.TenantContext{RoleCode: "Cashier", BranchID: branchA}
	if got, err := ResolveScopedBranchID(cashierTC, uuid.Nil); err != nil || got != branchA {
		t.Fatalf("cashier omitting branch must clamp to assigned branch A: got=%s err=%v", got, err)
	}
	if got, err := ResolveScopedBranchID(cashierTC, branchA); err != nil || got != branchA {
		t.Fatalf("cashier requesting assigned branch A should succeed: got=%s err=%v", got, err)
	}
	if _, err := ResolveScopedBranchID(cashierTC, branchB); err == nil {
		t.Fatalf("cashier requesting another branch B must be rejected")
	}

	managerTC := domain.TenantContext{RoleCode: "BranchManager", BranchID: branchA}
	if _, err := ResolveScopedBranchID(managerTC, branchB); err == nil {
		t.Fatalf("branch manager requesting another branch B must be rejected")
	}
}

func TestNormalizeBranchAndTerminalInput(t *testing.T) {
	if _, err := NormalizeBranchInput(SaveBranchRequest{Code: "KND"}); err == nil {
		t.Fatalf("expected error when branch name is blank")
	}
	br, err := NormalizeBranchInput(SaveBranchRequest{
		Name:                "Kandy Flagship",
		InitialTerminalCode: " knd pos 01 ",
	})
	if err != nil {
		t.Fatalf("unexpected error normalizing branch input: %v", err)
	}
	if br.Code == "" || br.CountryCode != "LK" || br.CountryName != "Sri Lanka" {
		t.Fatalf("unexpected branch defaults: %+v", br)
	}
	if br.InitialTerminalCode != "KND-POS-01" {
		t.Fatalf("expected normalized InitialTerminalCode KND-POS-01, got %q", br.InitialTerminalCode)
	}

	if _, err := NormalizeTerminalInput(SaveTerminalRequest{Name: "Counter 1", Code: "POS-1"}); err == nil {
		t.Fatalf("expected error when branch_id is missing on terminal")
	}
	branchID := uuid.New()
	if _, err := NormalizeTerminalInput(SaveTerminalRequest{BranchID: branchID, Name: "Counter 1"}); err == nil {
		t.Fatalf("expected error when terminal code is blank")
	}
	tm, err := NormalizeTerminalInput(SaveTerminalRequest{
		BranchID: branchID,
		Code:     " colombo counter 2 ",
		Name:     " Colombo Counter 2 ",
	})
	if err != nil {
		t.Fatalf("unexpected error normalizing terminal input: %v", err)
	}
	if tm.Code != "COLOMBO-COUNTER-2" || tm.Name != "Colombo Counter 2" {
		t.Fatalf("unexpected normalized terminal fields: %+v", tm)
	}
}

