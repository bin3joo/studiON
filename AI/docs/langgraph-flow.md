# LangGraph Flow Rules

## Overview
The AI workflow now uses a single LangGraph that covers analysis, suggestion generation, preview rendering, and user confirmation. FastAPI request creation and Dramatiq worker scheduling remain outside the graph.

## Unified Workflow
The workflow graph follows this product-oriented order:

1. entry context load
2. state initialization
3. project snapshot load
4. track clip sampling
5. cheap DSP scan
6. band overlap detection
7. clipping detection
8. high-band harshness detection
9. role candidate selection
10. CLAP gate
11. track role inference when needed
12. sibilance detection
13. merged analysis
14. candidate ranking
15. main track selection wait
16. policy RAG retrieval when needed
17. suggestion generation
18. hard rule validation
19. semantic critic
20. suggestion grouping
21. clipping auto-fix and logging
22. analysis persistence
23. user action gate
24. user selection wait
25. selected recipe apply
26. preview render
27. user confirm wait
28. commit or cancel path
29. feedback event emission
30. finalize output

## Flow Rules
- The graph ends in one of five stable states: waiting for main track intent, waiting for selection, waiting for confirmation, completed, failed.
- `clipping` keeps a deterministic auto-fix branch and also participates in persisted analysis results.
- `band_overlap` and `sibilance` trigger policy retrieval. There is no web fallback branch.
- A main track selection is collected before suggestion generation whenever ranked issue candidates exist.
- validator and critic can force regeneration of suggestions.
- The MVP exposes a single representative solution, so there is no preview-time reselect loop back to suggestion selection.
- user-facing preview and confirmation are part of the graph, not a separate apply graph.

## Storage Rules
- Redis is only for live runtime projection and is not the source of truth.
- MySQL remains the durable lifecycle and result source of truth.
- MongoDB stores evidence, snapshot, and artifact documents by reference only.
- Qdrant is used only for curated policy retrieval.

## Follow-up
- After the single-graph implementation stabilizes, create a 2-graph split variant and compare latency, operational complexity, and recoverability against the unified graph.
