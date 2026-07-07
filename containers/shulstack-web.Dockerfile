# syntax=docker/dockerfile:1.22

FROM node:24.14.1-slim@sha256:06e5c9f86bfa0aaa7163cf37a5eaa8805f16b9acb48e3f85645b09d459fc2a9f

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/platform/package.json ./packages/platform/
COPY packages/ui/package.json ./packages/ui/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "--filter", "@shulstack/web", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
