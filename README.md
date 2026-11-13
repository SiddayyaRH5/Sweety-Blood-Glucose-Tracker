# Sweety – Blood Glucose Tracker

A modern, secure and responsive blood glucose tracking application designed to help users record, monitor and understand their daily glucose readings through analytics and AI-powered insights.

**Live Application:** https://sweety-blood-glucose-tracker-liart.vercel.app/

**Backend API:** https://sweety-blood-glucose-tracker-krzv.onrender.com/

**GitHub Repository:** https://github.com/SiddayyaRH5/Sweety-Blood-Glucose-Tracker

---

## Overview

Sweety makes daily blood glucose tracking simple and accessible. Users can securely record their fasting and post-meal readings, monitor daily progress, review historical reports and receive AI-generated insights based on their recorded data.

The application provides a clean, responsive interface with secure authentication, PostgreSQL data persistence and a dedicated Care Assistant.

## Features

### Authentication and Security
- User registration and login.
- Password hashing using bcrypt.
- JWT-based authentication.
- Protected API endpoints.
- User-specific data access and isolation.
- Input validation and secure database queries.

### Blood Glucose Tracking
- Record up to four readings per day.
- Dedicated reading slots:
  - Morning (fasting)
  - After breakfast
  - After lunch
  - After dinner
- Add, edit and delete readings.
- Add notes to individual readings.
- Validate glucose values and reading dates.
- Prevent duplicate readings for the same daily slot.

### Dashboard
- Daily glucose tracking overview.
- Highest, lowest and average readings.
- Daily recording progress.
- Reading status indicators.
- Clear empty states for days without readings.

### Reports and Analytics
- Daily reports.
- Month-to-date reports.
- Previous-month reports.
- Glucose trends and statistics.
- Slot-wise average breakdown.
- Reading history.
- CSV export.

### AI-Powered Care Assistant
- Gemini-powered glucose pattern insights.
- Personalized summaries based on recorded readings.
- Conversational assistant for glucose-related questions.
- AI integration handled securely through the backend.

### User Experience
- Responsive desktop and mobile layouts.
- Clean mint-green and white interface.
- Interactive forms and validation feedback.
- Search and filter functionality.
- Persistent user sessions.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| API Integration | Axios |
| Icons | Lucide |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Authentication | JWT, bcrypt |
| AI Integration | Google Gemini API |
| Frontend Deployment | Vercel |
| Backend Deployment | Render |
| Database Hosting | Neon PostgreSQL |

## Application Architecture

```text
User
  |
  v
React + Vite Frontend
  |
  | REST API Requests
  v
Node.js + Express Backend
  |
  +---- JWT Authentication
  |
  +---- PostgreSQL Database
  |       (Neon)
  |
  +---- Google Gemini API
  |
  v
JSON Responses
  |
  v
React Dashboard and Reports
```

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm
- PostgreSQL or Docker Desktop (for local database development)
- Git

### 1. Clone the repository

```bash
git clone https://github.com/SiddayyaRH5/Sweety-Blood-Glucose-Tracker.git
```

### 2. Navigate to the project directory

```bash
cd Sweety-Blood-Glucose-Tracker
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a local `.env` file using the provided example:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

Configure the required variables in `.env` according to your local database and development setup.

Typical configuration:

```env
NODE_ENV=development
DATABASE_URL=your_postgresql_connection_string
DATABASE_SSL=false
JWT_SECRET=your_secure_random_secret
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=your_gemini_api_key
```

For production PostgreSQL hosting, configure SSL as required by your database provider.

**Security:** Never commit `.env` files, database passwords, JWT secrets or API keys to GitHub.

### 5. Start the database

If using the included Docker Compose configuration:

```bash
docker compose up -d
```

Alternatively, configure your own PostgreSQL database.

### 6. Run database migrations

```bash
npm run db:check
npm run db:migrate
```

### 7. Start the application

```bash
npm run dev
```

Open the application:

**http://localhost:3000**

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local development |
| `npm run build` | Build the production frontend |
| `npm start` | Start the production server |
| `npm test` | Run automated tests |
| `npm run lint` | Run code linting |
| `npm run db:check` | Check database connectivity |
| `npm run db:migrate` | Apply database migrations |

## Deployment

Sweety is deployed using the following services:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** Neon PostgreSQL

Configure production environment variables in the respective hosting dashboards. Keep all private credentials on the backend.

## Project Structure

```text
Sweety-Blood-Glucose-Tracker/
│
├── src/                  # React frontend
├── server/               # Backend application
├── dist/                 # Generated production build
│
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore configuration
├── docker-compose.yml    # Local database configuration
├── package.json          # Dependencies and scripts
├── package-lock.json     # Dependency lock file
├── render.yaml           # Render deployment configuration
├── vercel.json           # Vercel deployment configuration
├── vite.config.js        # Vite configuration
└── README.md             # Project documentation
```

## Testing and Quality

The project includes automated tests and development checks.

Run:

```bash
npm test
npm run lint
npm run build
```

Database integration checks can be performed using:

```bash
node --test server/postgres.integration.test.js
```

## Future Improvements

- Additional glucose trend visualizations.
- More configurable reporting periods.
- Enhanced accessibility.
- Additional personalized tracking insights.

## Important Health Disclaimer

Sweety is intended for personal glucose tracking and informational purposes only. AI-generated insights are not medical diagnoses or treatment recommendations. Users should consult qualified healthcare professionals for medical decisions.

## Author

**Siddayya Rudrayya Hiremath**

Computer Science and Engineering

GitHub: https://github.com/SiddayyaRH5

LinkedIn: https://www.linkedin.com/in/siddayyahiremath/

---

*Sweety – Making daily glucose tracking simpler, smarter and more accessible.*
