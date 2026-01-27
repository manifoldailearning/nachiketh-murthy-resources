# Agentic AI Interview – Experienced Hire - Part 2

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
  
## Q3: Memory Design Decisions

### Interview Question

- How do you design memory for an agentic system?
  
### What the Interviewer Is Testing

- System design thinking
  
- Privacy and compliance awareness
  
- Failure mode handling
  
### Strong Answer Signals

- Separates short term and long term memory
  
- Explains when NOT to store memory
  
- Mentions audit and replay needs
  
### Weak Answer Signals

- Just naming a vector database
  
- No privacy or retention discussion
  
### Follow Up Questions

- What if the memory store is down?
  
- How do you handle sensitive data?
  
## Q4: Failure Handling and Retries

### Interview Question

- An external API call fails. What happens next?
  
### What the Interviewer Is Testing

- Production readiness
  
- Idempotency awareness
  
- Operational experience
  
### Strong Answer Signals

- Partial failure handling
  
- Safe retries via idempotency
  
- Timeouts and backoff strategy
  
- Observability and tracing
  
### Weak Answer Signals

- Retry three times with try catch
  
- No observability discussion
  
### Follow Up Questions

- How do you prevent cascading failures?
  
- How would you debug this at 3 AM?
  
## Q5: Evaluation and Human in the Loop

### Interview Question

- How do you know your agent is working correctly?
  
### What the Interviewer Is Testing

- Evaluation as a continuous process
  
- Risk based automation decisions
  
### Strong Answer Signals

- Automated evaluation plus human approval gates
  
- Mentions regression and monitoring
  
- Explains which actions require humans
  
### Weak Answer Signals

- Test with a few examples
  
- Human reviews everything
  
### Follow Up Questions

- How do you detect drift?
  
- How do you measure quality over time?
  
## INTERVIEW SUCCESS PATTERNS

### Ask clarifying questions first

### Explain trade-offs explicitly

### Think out loud

### Discuss failure modes proactively

