package main

import "testing"

func TestPostgresDatabaseName(t *testing.T) {
	for _, test := range []struct {
		name    string
		dsn     string
		want    string
		wantErr bool
	}{
		{name: "postgres", dsn: "postgres://user:secret@127.0.0.1:5432/plush_erp?sslmode=disable", want: "plush_erp"},
		{name: "postgresql", dsn: "postgresql://user:secret@db.example/yoyoosun", want: "yoyoosun"},
		{name: "missing database", dsn: "postgres://user:secret@127.0.0.1:5432", wantErr: true},
		{name: "wrong scheme", dsn: "mysql://user:secret@127.0.0.1/plush_erp", wantErr: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := postgresDatabaseName(test.dsn)
			if test.wantErr {
				if err == nil {
					t.Fatalf("postgresDatabaseName(%q)=%q, want error", test.dsn, got)
				}
				return
			}
			if err != nil || got != test.want {
				t.Fatalf("postgresDatabaseName(%q)=%q err=%v, want %q", test.dsn, got, err, test.want)
			}
		})
	}
}
