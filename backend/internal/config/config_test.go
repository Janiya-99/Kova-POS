package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDotEnvFileRespectsExistingEnv(t *testing.T) {
	dir := t.TempDir()
	envPath := filepath.Join(dir, ".env")
	content := "# comment line\nTEST_KOVA_PORT=\"9090\"\nTEST_KOVA_HOST='localhost'\nexport TEST_KOVA_OVERRIDE=from_file\n"
	if err := os.WriteFile(envPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write temp .env: %v", err)
	}

	t.Setenv("TEST_KOVA_OVERRIDE", "from_os_env")
	t.Cleanup(func() {
		_ = os.Unsetenv("TEST_KOVA_PORT")
		_ = os.Unsetenv("TEST_KOVA_HOST")
	})

	loadDotEnvFile(envPath)

	if got := os.Getenv("TEST_KOVA_PORT"); got != "9090" {
		t.Fatalf("expected TEST_KOVA_PORT=9090, got %q", got)
	}
	if got := os.Getenv("TEST_KOVA_HOST"); got != "localhost" {
		t.Fatalf("expected TEST_KOVA_HOST=localhost, got %q", got)
	}
	if got := os.Getenv("TEST_KOVA_OVERRIDE"); got != "from_os_env" {
		t.Fatalf("expected OS env override to win, got %q", got)
	}
}

