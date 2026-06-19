# Fair ERP

A web-based ERP system built with Node.js, Express, MongoDB, and EJS. It provides
modules for managing accounting, HR, inventory, stock, users, and customer care.

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **Server:** Express
- **Database:** MongoDB (Mongoose)
- **Views:** EJS + ejs-mate
- **Security:** Helmet, CSRF (csurf), express-rate-limit, bcrypt, express-session

## Modules

- **Accounting** – financial records and ledgers
- **HR** – employee and human-resources management
- **Inventory & Stock** – product and stock tracking
- **Users** – authentication and user management
- **Care** – customer/lead handling

## Getting Started

### Prerequisites

- Node.js 18+
- A MongoDB instance (local or hosted)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the project root with your settings, for example:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/fair-erp
SESSION_SECRET=your-session-secret
```

### Running

```bash
npm start
```

The app will start the Express server (see `server.js`).

## Project Structure

```
config/       App and database configuration
middleware/   Express middleware (auth, security, etc.)
models/       Mongoose schemas (accounting, hr, inventory, users, ...)
routes/       Route handlers per module
views/        EJS templates
public/       Static assets
scripts/      Maintenance and data-sync scripts
utils/        Shared helpers
server.js     Application entry point
```

## Scripts

- `npm start` – start the server
- `npm run audit` – run dependency security audit
- `npm run audit:fix` – attempt to fix audit issues

## License

EULA
