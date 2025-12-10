# Repository Analyzer Container

This container provides a service for cloning Git repositories and serving file contents for analysis by Cloudflare Workers AI.

## Features

- Clone Git repositories
- List repository files
- Serve file contents via HTTP API
- Batch file analysis

## Building and Deploying

1. Build the container image:
```bash
cd containers/repo-analyzer
docker build -t repo-analyzer .
```

2. The container will be automatically built and deployed when you run `wrangler deploy` from the project root.

## API Endpoints

- `GET /health` - Health check
- `POST /clone` - Clone a repository
  ```json
  {
    "repo_url": "https://github.com/owner/repo",
    "owner": "owner",
    "repo": "repo",
    "token": "github_token"
  }
  ```
- `GET /files?owner=...&repo=...` - List all files in repository
- `GET /file/<path>?owner=...&repo=...` - Get single file content
- `POST /analyze` - Get multiple files
  ```json
  {
    "owner": "owner",
    "repo": "repo",
    "file_paths": ["path1", "path2"],
    "max_size": 8000
  }
  ```

## Usage

The container is automatically used by the `analyzeRepoAndGenerateQuestions` function when `useContainer` is set to `true`. It falls back to GitHub API if the container is unavailable.


