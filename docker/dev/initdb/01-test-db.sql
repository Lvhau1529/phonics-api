-- Chạy một lần khi volume Postgres còn trống: DB riêng cho `pnpm test:e2e` của API (bị TRUNCATE khi test)
CREATE DATABASE phonics_test;
