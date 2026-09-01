/**
 * Compiles a state-preserving session handoff summary from session transcripts
 */
export function compileSessionHandoff(session) {
  if (!session || !session.turns || session.turns.length === 0) {
    return {
      summaryPrompt: 'Resume work on the current task.',
      taskGoal: 'Unknown',
      modifiedFiles: [],
      lastDecision: '',
      turnCount: 0,
      tokensSavedEstimate: 0,
      isBloated: false
    };
  }

  // 1. Task goal from the first user prompt
  const firstTurn = session.turns[0];
  let taskGoal = firstTurn.userPrompt || 'Ongoing coding task';
  taskGoal = taskGoal.replace(/<USER_REQUEST>/g, '').replace(/<\/USER_REQUEST>/g, '').trim();
  if (taskGoal.length > 200) taskGoal = taskGoal.substring(0, 200) + '...';

  // 2. Extract modified files from tool calls
  const filesSet = new Set();
  for (const turn of session.turns) {
    for (const tool of turn.toolCalls) {
      const inputStr = JSON.stringify(tool.input || '');
      const matches = inputStr.match(/(?:apps|packages|docs|infra|src)\/[a-zA-Z0-9_\-\.\/]+/g);
      if (matches) {
        matches.forEach(f => filesSet.add(f));
      }
    }
  }
  const modifiedFiles = Array.from(filesSet).slice(0, 8);

  // 3. Last assistant response / conclusion
  const lastTurn = session.turns[session.turns.length - 1];
  let lastDecision = lastTurn.assistantMessage || '';
  if (lastDecision.length > 300) lastDecision = lastDecision.substring(0, 300) + '...';

  // 4. Calculate realistic per-turn token carryover savings
  // The savings is what you avoid re-sending from the last turn's context window (~1500 tokens for fresh prompt)
  const lastTurnInput = lastTurn?.tokenUsage?.input_tokens || 0;
  const tokensSavedPerTurn = Math.max(lastTurnInput - 1500, 0);
  const isBloated = session.turns.length >= 12 || lastTurnInput > 120000;

  // 5. Generate structured 1-paragraph prompt
  const filesList = modifiedFiles.length > 0 
    ? modifiedFiles.map(f => `\`${f}\``).join(', ') 
    : 'relevant workspace files';

  const summaryPrompt = `# Task Continuation & Clean Handoff

**Context Goal**: ${taskGoal}
**Active Working Files**: ${filesList}
**Last Progress/State**: ${lastDecision ? lastDecision.replace(/\n+/g, ' ') : 'Ready for next implementation step.'}

**Next Action Needed**: Please proceed with the next specific task step while keeping file reads and tool outputs compact.`;

  return {
    sessionId: session.sessionId,
    threadName: session.threadName,
    taskGoal,
    modifiedFiles,
    lastDecision,
    turnCount: session.turns.length,
    lastTurnInputTokens: lastTurnInput,
    tokensSavedEstimate: tokensSavedPerTurn,
    isBloated,
    summaryPrompt
  };
}
