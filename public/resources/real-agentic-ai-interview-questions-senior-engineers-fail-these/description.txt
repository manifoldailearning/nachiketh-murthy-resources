# Agentic AI Interview – Experienced Hire

## INTERVIEW CONTEXT

### Target Roles

- Backend Engineers
  
- ML Engineers
  
- Platform Engineers
  
- AI Engineers (3+ years)
  
### Interview Focus

- System design thinking
  
- Production experience
  
- Failure handling and trade-offs
  
## Q1: Multi Agent vs Single Agent

### Interview Question

- When would you choose a single agent instead of a multi agent system?
  
### What the Interviewer Is Testing

- Context driven architecture decisions
  
- Trade-off thinking
  
- Production cost and latency awareness
  
### Strong Answer Signals

- Clarifies constraints before answering
  
- Mentions latency and orchestration cost
  
- Explains failure domain isolation
  
- Gives scenario-based justification
  
### Weak Answer Signals

- Multi agent is always better
  
- Single agent is simpler so start there
  
- No cost or latency discussion
  
### Follow Up Questions

- How would you observe failures here?
  
- What changes at 10x traffic?
  
- How would you debug this in prod?
  
## Q2: Planner vs Executor Roles

### Interview Question

- Why separate planner and executor agents?
  
### What the Interviewer Is Testing

- Failure isolation understanding
  
- Control and observability mindset
  
### Strong Answer Signals

- Planner owns state and decisions
  
- Executors are constrained and replaceable
  
- Mentions retry and substitution logic
  
### Weak Answer Signals

- Just a design pattern
  
- Cleaner code explanation only
  
### Follow Up Questions

- What happens if the planner crashes?
  
- How do you replay execution?