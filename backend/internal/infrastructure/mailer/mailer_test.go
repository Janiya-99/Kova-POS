package mailer

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestSendPasswordResetEmailOverMockSMTP(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen mock smtp: %v", err)
	}
	defer func() { _ = ln.Close() }()

	var (
		mu       sync.Mutex
		captured string
		rcptTo   string
		mailFrom string
	)

	done := make(chan struct{})
	go func() {
		defer close(done)
		conn, acceptErr := ln.Accept()
		if acceptErr != nil {
			return
		}
		defer func() { _ = conn.Close() }()

		reader := bufio.NewReader(conn)
		write := func(line string) {
			_, _ = fmt.Fprintf(conn, "%s\r\n", line)
		}

		write("220 localhost mock SMTP ready")
		inData := false
		var body strings.Builder

		for {
			line, readErr := reader.ReadString('\n')
			if readErr != nil {
				return
			}
			trimmed := strings.TrimRight(line, "\r\n")

			if inData {
				if trimmed == "." {
					mu.Lock()
					captured = body.String()
					mu.Unlock()
					inData = false
					write("250 2.0.0 Ok: queued")
					continue
				}
				body.WriteString(line)
				continue
			}

			upper := strings.ToUpper(trimmed)
			switch {
			case strings.HasPrefix(upper, "EHLO"), strings.HasPrefix(upper, "HELO"):
				write("250-localhost")
				write("250 AUTH PLAIN LOGIN")
			case strings.HasPrefix(upper, "AUTH PLAIN"):
				write("235 2.7.0 Authentication successful")
			case strings.HasPrefix(upper, "MAIL FROM:"):
				mu.Lock()
				mailFrom = trimmed
				mu.Unlock()
				write("250 2.1.0 Ok")
			case strings.HasPrefix(upper, "RCPT TO:"):
				mu.Lock()
				rcptTo = trimmed
				mu.Unlock()
				write("250 2.1.5 Ok")
			case upper == "DATA":
				inData = true
				write("354 End data with <CR><LF>.<CR><LF>")
			case upper == "QUIT":
				write("221 2.0.0 Bye")
				return
			default:
				write("250 Ok")
			}
		}
	}()

	host, port, _ := net.SplitHostPort(ln.Addr().String())
	m := New(Config{
		Host:       host,
		Port:       port,
		User:       "noreply@kovapos.io",
		Password:   "app-secret",
		From:       "KOVA POS <noreply@kovapos.io>",
		AppBaseURL: "https://pos.example.com",
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = m.SendPasswordResetEmail(ctx, PasswordResetEmailInput{
		ToEmail:          "cashier@zonaretail.com",
		FullName:         "Maya Lin",
		CompanySlug:      "zona-retail",
		Code:             "482913",
		ResetToken:       "tok_abc123",
		ExpiresInMinutes: 15,
	})
	if err != nil {
		t.Fatalf("SendPasswordResetEmail returned error: %v", err)
	}
	<-done

	mu.Lock()
	defer mu.Unlock()
	if !strings.Contains(mailFrom, "<noreply@kovapos.io>") {
		t.Fatalf("expected MAIL FROM <noreply@kovapos.io>, got %q", mailFrom)
	}
	if !strings.Contains(rcptTo, "<cashier@zonaretail.com>") {
		t.Fatalf("expected RCPT TO <cashier@zonaretail.com>, got %q", rcptTo)
	}
	if !strings.Contains(captured, "482913") {
		t.Fatalf("expected email body to include OTP code 482913")
	}
	if !strings.Contains(captured, "https://pos.example.com/c/zona-retail/login?email=cashier%40zonaretail.com&reset_token=tok_abc123") {
		t.Fatalf("expected reset URL in email body, got:\n%s", captured)
	}
}

func TestMailerErrorsGracefullyWhenUnconfigured(t *testing.T) {
	m := New(Config{})
	if m.IsConfigured() {
		t.Fatal("expected empty host mailer to report unconfigured")
	}
	err := m.SendPasswordResetEmail(context.Background(), PasswordResetEmailInput{
		ToEmail: "owner@zonaretail.com",
		Code:    "123456",
	})
	if err == nil || !strings.Contains(err.Error(), "SMTP_HOST") {
		t.Fatalf("expected actionable SMTP configuration error, got: %v", err)
	}
}

