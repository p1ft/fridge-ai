# Contributing

Use Node.js 22. From the repository root, run `npm ci`, then `npm test`.
For a live local session, copy `hosted/.env.example` to `hosted/.env.local`,
configure credentials, and run `npm run dev`.

Before submitting a change:

```sh
npm run format
npm run check
npm test
```

Keep server credentials in environment variables. Tests must mock provider and
database traffic; they must not spend live AI quota. Add regression coverage for
changes to inventory validation, visitor isolation, persistence, and provider errors.

Describe the user-visible change, why it is needed, and how it was verified.
Keep commits focused and use imperative messages. Do not commit generated logs,
private photographs, environment files, or deployment credentials.
