# SoundHaus

A collaborative music project management platform with version control powered by Gitea, user authentication via Supabase, and real-time file syncing.

## 🏗️ Architecture

- **Frontend**: React + Vite
- **Backend**: FastAPI (Python)
- **Git Server**: Gitea (self-hosted)
- **Database**: PostgreSQL
- **Authentication**: Supabase
- **File Storage**: Git LFS (Large File Storage for audio files)

## 📁 Project Structure

```
SoundHausRND/
├── apps/
│   └── backend/           # FastAPI application
│       ├── api/           # API routes and dependencies
│       ├── core/          # Core services (auth, repo, gitea)
│       ├── schemas/       # Pydantic models
│       └── main.py        # Application entry point
├── react/                 # React frontend application
├── workers/              # File watcher worker scripts
├── gitea/                # Gitea data volume
└── docker-compose.yml    # Container orchestration
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for React frontend)
- Python 3.11+ (if running backend locally)

### 1. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd SoundHausRND

# Create environment file (if not exists)
cp apps/backend/.env.example apps/backend/.env
```

### 2. Configure Environment Variables

Edit `apps/backend/.env` with your credentials:

```env
# Gitea Configuration
GITEA_URL=http://gitea:3000
GITEA_ADMIN_TOKEN=your-gitea-admin-token-here

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUB_KEY=your-publishable-key
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# API Configuration
API_URL=http://localhost:8000
```

#### Getting Gitea Admin Token

1. Start containers: `docker-compose up -d`
2. Access Gitea: http://localhost:3000
3. Login with admin account
4. Go to: **Settings → Applications → Manage Access Tokens**
5. Generate new token with **ALL scopes** (especially `write:admin`)
6. Copy token to `.env` file

#### Getting Supabase Credentials

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to: **Settings → API**
4. Copy:
   - Project URL → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_PUB_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`
   - JWT Secret → `SUPABASE_JWT_SECRET`

### 3. Start Services

```bash
# Start all containers (Gitea, FastAPI, PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f fastapi
docker-compose logs -f gitea
```

### 4. Verify Services

```bash
# Check all containers are running
docker-compose ps

# Test API health
curl http://localhost:8000/health

# Access services
# - API: http://localhost:8000
# - API Docs: http://localhost:8000/docs
# - Gitea: http://localhost:3000
```

### 5. Setup React Frontend

```bash
# Navigate to React app
cd react

# Install dependencies
npm install

# Start development server
npm run dev

# Frontend will be available at http://localhost:5173
```

## 🧪 Testing the Application

### Test API Endpoints

#### 1. Test Root Endpoint
```bash
curl http://localhost:8000/
# Expected: {"message":"SoundHaus API","version":"1.0.0","status":"running"}
```

#### 2. Test Health Check
```bash
curl http://localhost:8000/health
# Expected: {"status":"healthy"}
```

#### 3. Test Authentication (Sign Up)
```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "name": "Test User"
  }'
```

#### 4. Test Authentication (Login)
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'

# Save the access_token from response for next requests
```

#### 5. Test List Repositories (Protected)
```bash
curl -X GET http://localhost:8000/repos \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 6. Test Create Repository
```bash
curl -X POST http://localhost:8000/repos \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-music-project",
    "description": "My awesome music project",
    "private": true
  }'
```

### Test Full User Flow

1. **Sign Up**: Create account at http://localhost:5173
2. **Login**: Sign in with credentials
3. **Create Repository**: Click "New Repository"
4. **Upload Files**: Upload audio files or project files
5. **Collaborate**: Invite other users to your project

### Test with React Frontend

```bash
# Make sure all services are running
docker-compose ps

# Start React app
cd react
npm run dev

# Open browser
open http://localhost:5173

# Test the following:
# 1. Sign up with new account
# 2. Login with credentials
# 3. Create a new repository
# 4. Upload a file to the repository
# 5. Browse repository contents
```

## 🛠️ Development

### Backend Development

```bash
# View live logs
docker-compose logs -f fastapi

# Restart backend after code changes (auto-reload enabled)
# Changes are automatically detected via volume mount

# Run backend locally (without Docker)
cd apps/backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd react
npm run dev         # Start dev server
npm run build       # Build for production
npm run preview     # Preview production build
```

### Database Access

```bash
# Access PostgreSQL
docker exec -it postgres psql -U soundhaus -d soundhaus_db

# Common commands:
\dt                 # List tables
\d table_name       # Describe table
SELECT * FROM ...   # Query data
```

### Gitea Management

```bash
# Access Gitea CLI
docker exec --user git gitea gitea admin user list

# Create admin user (if needed)
docker exec --user git gitea gitea admin user create \
  --username admin \
  --password adminpass \
  --email admin@example.com \
  --admin

# Regenerate admin token
# Go to http://localhost:3000 → Settings → Applications
```

## 🐛 Troubleshooting

### Common Issues

#### 1. "user does not exist" Error
**Problem**: Gitea admin token is invalid or missing `write:admin` scope

**Solution**:
```bash
# 1. Login to Gitea: http://localhost:3000
# 2. Go to Settings → Applications
# 3. Delete old token
# 4. Create new token with ALL scopes
# 5. Update GITEA_ADMIN_TOKEN in .env
# 6. Restart: docker-compose restart fastapi
```

#### 2. "401 Unauthorized" on Login
**Problem**: Supabase credentials incorrect

**Solution**:
```bash
# Verify credentials in .env match Supabase dashboard
# Check: SUPABASE_URL, SUPABASE_PUB_KEY, SUPABASE_JWT_SECRET
docker-compose restart fastapi
```

#### 3. Frontend Can't Connect to Backend
**Problem**: CORS or network issue

**Solution**:
```bash
# Check backend is running
curl http://localhost:8000/health

# Check CORS origins in apps/backend/core/config.py
# Should include: http://localhost:5173

# Restart backend
docker-compose restart fastapi
```

#### 4. Import Errors in Backend
**Problem**: Module not found or import path wrong

**Solution**:
```bash
# Rebuild backend container
docker-compose down
docker-compose build fastapi
docker-compose up -d

# Check logs
docker-compose logs fastapi
```

#### 5. Gitea Database Locked
**Problem**: Gitea container crashed or database corrupt

**Solution**:
```bash
# Stop all containers
docker-compose down

# Start Gitea first
docker-compose up -d gitea
sleep 10

# Start remaining services
docker-compose up -d
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f fastapi
docker-compose logs -f gitea
docker-compose logs -f postgres

# Last N lines
docker-compose logs --tail=100 fastapi
```

### Reset Everything

```bash
# ⚠️ WARNING: This will delete all data!

# Stop and remove containers
docker-compose down

# Remove volumes (deletes database data)
docker-compose down -v

# Remove Gitea data
rm -rf gitea/

# Start fresh
docker-compose up -d
```

## 📚 API Documentation

### Interactive API Docs

Once the backend is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### API Endpoints Overview

#### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/user` - Get current user info
- `PATCH /api/auth/user` - Update user info
- `POST /api/auth/reset-password` - Reset password

#### Repositories
- `GET /repos` - List user repositories
- `POST /repos` - Create new repository
- `GET /repos/{repo_name}/contents` - Get repository contents
- `POST /repos/{repo_name}/upload` - Upload file
- `DELETE /repos/{repo_name}/contents` - Delete file

#### Collaborators
- `POST /repos/{repo_name}/collaborators/invite` - Invite collaborator
- `GET /repos/{repo_name}/collaborators` - List collaborators
- `GET /invitations/pending` - Get pending invitations
- `POST /invitations/{id}/accept` - Accept invitation
- `DELETE /repos/{repo_name}/collaborators/{username}` - Remove collaborator

#### File Watching
- `POST /watch/start` - Start file watch session
- `POST /watch/stop` - Stop watch session
- `GET /watch/status/{watch_id}` - Get watch status
- `GET /watch/sessions` - List active sessions

## 🔒 Security Notes

- **Never commit `.env` files** - Contains sensitive credentials
- **Rotate tokens regularly** - Gitea and Supabase tokens
- **Use strong passwords** - Especially for admin accounts
- **Keep dependencies updated** - Regular security updates
- **Restrict Gitea admin token** - Only use for backend services

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📝 License

[Add your license here]

## 💡 Tips

- Use Git LFS for audio files (`.wav`, `.mp3`, `.als`, etc.)
- Keep repository sizes under 1GB for better performance
- Regularly backup Gitea and PostgreSQL data
- Monitor container resources with `docker stats`

## 📞 Support

For issues or questions:
- Check the [Troubleshooting](#-troubleshooting) section
- View logs: `docker-compose logs -f`
- Open an issue on GitHub
# SoundHausRND
The research and development repository for The Sound Haus project. 
