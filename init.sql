-- tạo user
CREATE USER todo_user WITH PASSWORD '123456';

-- tạo database
CREATE DATABASE todo;

-- cấp quyền
GRANT ALL PRIVILEGES ON DATABASE todo TO todo_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO todo_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO todo_user;

-- connect vào DB
\c todo

-- tạo table
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL
);