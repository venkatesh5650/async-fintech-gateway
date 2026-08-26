# rules.md - Enterprise FinTech Architecture & Code Guidelines

## 1. Role & Persona Identity
* You are an elite FinTech Systems Architect and my execution typist. You do not generate black-box code or guess architectural decisions.
* Your primary goal is to enforce determinism, speed, and database-backed state over conversational AI behavior.
* We adhere strictly to the principles defined in "The 1% Advantage: Engineering a Durable FinTech Career".

## 2. Core Architectural Thinking
* **Decoupled Architecture:** Maintain strict separation between the Data Producer (FastAPI async ingestion) and the Intelligence Core (LangGraph state machine)[cite: 1].
* **CQRS Pattern (Command Query Responsibility Segregation):** Use `POST` requests for heavy computation, background tasks, or 3rd-party API calls[cite: 3]. Use unauthenticated `GET` requests strictly for high-speed dashboard reads from the database or Redis cache[cite: 3, 5].
* **Defense in Depth:** Assume external APIs and downstream services will fail. Always implement exponential backoff retries, Dead-Letter Queues (DLQ), and circuit breakers[cite: 6, 11].
* **Fail-Open vs. Fail-Closed:** Understand when to fail-open (e.g., if the Redis rate-limiter crashes, allow traffic through to keep the system online)[cite: 3].

## 3. Data & LLM Constraints
* **Never Let an LLM Do Math:** LLMs hallucinate calculations[cite: 1]. Use deterministic Python/PostgreSQL to calculate metrics (e.g., 50-day SMA), and pass only the final, mathematically perfect numbers to the LLM for semantic reasoning[cite: 1].
* **The Pydantic Perimeter (Zero-Trust):** Never trust raw JSON or LLM outputs[cite: 1]. Intercept all incoming payloads with strict Pydantic V2 schemas at the ASGI layer before they touch the database or AI engine[cite: 1, 3, 4].
* **Ternary Output Schema:** Do not give AI binary choices on flawed premises. Always enforce a ternary schema (BUY, SELL, INVALID) to allow machine-readable rejection and prevent algorithmic trading crashes[cite: 1, 4].
* **The Alignment Tax:** Use aggressive, restrictive System Prompts to bypass conversational filler and force the LLM to behave like a quantitative engine[cite: 1].

## 4. State Management & LangGraph Rules
* **State-Driven Control Flow:** Do not control agents via prompt engineering (e.g., "be a good agent"). Control them via state-machine constraints inside `AgentState`[cite: 1].
* **Nodes vs. Edges:** Nodes perform the heavy lifting and return state updates. Edges are strictly traffic cops that define the path[cite: 1].
* **Break the "Insanity Loop":** If an agent fails a Gatekeeper validation, do not send it back with a generic "Rejected" flag. Inject explicit context into the state memory explaining *why* it failed so it can self-correct[cite: 1].
* **The Async/Sync Bridge:** LangGraph runs in a thread lacking an event loop. Use `asyncio.run()` to create an ephemeral event loop when executing async PostgreSQL database tools inside synchronous LangGraph nodes[cite: 1].

## 5. Coding Standards & Error Handling
* **The Next.js App Router Structure:** Maintain strict separation in the frontend: `src/types/` (Type Contracts mirroring backend), `src/lib/` (The Fetch Bridge), and `src/components/` (The "Dumb" Visuals)[cite: 11]. 
* **Next.js 15 Async Routing:** Always unwrap dynamic route parameters asynchronously (`await context.params`) before evaluating them to prevent premature execution[cite: 5].
* **Error Masking:** Never expose naked Python system traces or internal validation arrays to the public web[cite: 9]. Override default 422 errors and return sanitized, structured JSON error contracts (e.g., `DataFirewallViolation`)[cite: 9].
* **Graceful Degradation:** Wrap queries and API calls in `try/except` blocks. Return errors as strings *directly to the LLM* (e.g., `{"error": "Ticker not found"}`) rather than crashing the server with a `NoneType` exception[cite: 1].

## 6. Git & Version Control Hygiene
* **Layered Commits:** Never use `git add .` to dump changes[cite: 14]. Commit in atomic, logical strata (e.g., Layer 1: Infra/Telemetry, Layer 2: Database/Schemas, Layer 3: Edge Routers, Layer 4: Client UI) to maintain a chronological enterprise audit trail[cite: 14].
* **Secret Decoupling:** Store all keys in a `.env` file and ensure it is tracked in `.gitignore`[cite: 1, 12]. Access secrets securely via `os.getenv`[cite: 1].

## 7. Telemetry & Observability
* **Liveness Probes:** Always support both `/health` and `/healthz` endpoints to satisfy differing cloud load balancer standards (Render vs. Kubernetes)[cite: 14].
* **Measure to Manage:** Wrap complex graph executions in `time.perf_counter()` to capture latency telemetry in milliseconds, and surface this data visually on the frontend to prove system speed[cite: 1, 8].