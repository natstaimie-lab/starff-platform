# Setup — step by step (beginner)

Do these **in order**. Don't skip ahead. Each step ends with a way to check it worked.
When something says "run", type it in the Terminal from the `starff-platform` folder.

---

## Step 0 — Install the tools (one time)

1. **Node.js** (this runs all our code). Install the LTS version from
   <https://nodejs.org>. Then check it worked:
   ```bash
   node --version    # should print v20.x or higher
   ```
2. **Git** (saves your work history). Mac usually has it: `git --version`.
   If not, install from <https://git-scm.com>.
3. A code editor: **VS Code** — <https://code.visualstudio.com>.

✅ *Check:* all three version commands print a number.

---

## Step 1 — Create the database (Supabase)

Supabase gives you a real PostgreSQL database, login system, and file storage —
free to start, nothing to install.

1. Go to <https://supabase.com> → **Sign up** → **New project**.
2. Name it `starff`, choose a region near the UK (London/EU), set a **database
   password** (save it somewhere safe).
3. Wait ~2 minutes for it to build.

✅ *Check:* you can see the project dashboard.

---

## Step 2 — Connect the project to the database

1. In this folder, copy the example env file:
   ```bash
   cp .env.example .env
   ```
2. In Supabase: **Project Settings → Database → Connection string → URI**.
   Copy it, paste it into `.env` as `DATABASE_URL`, and replace `YOUR-PASSWORD`
   with the password from Step 1.
3. In Supabase: **Project Settings → API**. Copy the URL and the two keys into the
   matching lines in `.env`.

✅ *Check:* your `.env` has no `YOUR-...` placeholders left in the database lines.

---

## Step 3 — Create the tables

1. Install dependencies (first time only):
   ```bash
   npm install
   ```
2. Push the schema (all the tables from `schema.prisma`) into your database:
   ```bash
   npm run db:push
   ```
3. Open a visual view of your tables:
   ```bash
   npm run db:studio
   ```

✅ *Check:* Prisma Studio opens in your browser and you see empty tables:
`User`, `Candidate`, `Client`, `Job`, `Shift`, `Timesheet`, … If you see them, **the
database is done** — this is the milestone for Stage 0/1.

You can also confirm in Supabase → **Table Editor** — the same tables appear there.

---

## Step 4 — What's next

Stop here for now. Once the tables exist, the next stage is building the **API**
(`apps/api`). Ask Claude: *"Scaffold the NestJS API with auth and the candidates
module"* and we'll do Stage 1 together.

---

### If something breaks

- `command not found: npm` → Node didn't install; redo Step 0.
- `db:push` fails with a connection error → the `DATABASE_URL` password is wrong, or
  you used the pooled (port 6543) string. Use the direct **5432** connection string.
- Still stuck → copy the error message and ask Claude.
