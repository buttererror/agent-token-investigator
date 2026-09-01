/**
 * Compiles a state-preserving session handoff summary from session transcripts.
 * Produces actionable, structured resumption prompts optimized for new agent threads.
 */
export function compileSessionHandoff(session) {
  if (!session || !session.turns || session.turns.length === 0) {
    return {
      summaryPrompt: 'Resume work on the current task.',
      taskGoal: 'Unknown',
      userDirectives: [],
      modifiedFiles: [],
      readFiles: [],
      recentActions: [],
      lastDecision: '',
      turnCount: 0,
      tokensSavedEstimate: 0,
      isBloated: false
    };
  }

  const agentLabel = session.agentLabel || (session.agentType === 'antigravity' ? 'Antigravity' : 'Codex');
  const agentIcon = session.agentIcon || (session.agentType === 'antigravity' ? '🌌' : '🤖');

  // 1. Extract task goal and key user directives across turns
  const userPrompts = session.turns
    .map(t => (t.userPrompt || '').replace(/<USER_REQUEST>/g, '').replace(/<\/USER_REQUEST>/g, '').trim())
    .filter(p => p.length > 0);

  const initialGoal = userPrompts[0] || 'Ongoing implementation and debugging task';
  const latestPrompt = userPrompts.length > 1 ? userPrompts[userPrompts.length - 1] : initialGoal;
  
  // Deduplicate and collect distinct user directives (up to 5 recent)
  const uniqueDirectives = [];
  userPrompts.slice(-5).forEach(p => {
    const clean = p.replace(/\s+/g, ' ').trim();
    if (clean && !uniqueDirectives.includes(clean)) {
      uniqueDirectives.push(clean.length > 180 ? clean.substring(0, 180) + '...' : clean);
    }
  });

  // 2. Extract modified files, inspected files, and key actions from tool calls
  const modifiedFilesSet = new Set();
  const readFilesSet = new Set();
  const recentActionsList = [];

  for (const turn of session.turns) {
    for (const tool of (turn.toolCalls || [])) {
      const toolName = tool.tool || '';
      const inputStr = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input || {});

      // Identify modified/written files
      if (
        toolName.includes('write_to_file') || 
        toolName.includes('replace_file_content') || 
        toolName.includes('edit_file') || 
        toolName.includes('apply_diff')
      ) {
        if (tool.input?.TargetFile) modifiedFilesSet.add(tool.input.TargetFile);
        if (tool.input?.target_file) modifiedFilesSet.add(tool.input.target_file);
        if (tool.input?.path) modifiedFilesSet.add(tool.input.path);
      }

      // Identify inspected/read files
      if (toolName.includes('view_file') || toolName.includes('read_file')) {
        if (tool.input?.AbsolutePath) readFilesSet.add(tool.input.AbsolutePath);
        if (tool.input?.path) readFilesSet.add(tool.input.path);
        if (tool.input?.file_path) readFilesSet.add(tool.input.file_path);
      }

      // General path regex extraction
      const matches = inputStr.match(/(?:apps|packages|docs|infra|src|server)\/[a-zA-Z0-9_\-\.\/]+/g);
      if (matches) {
        matches.forEach(f => {
          if (toolName.includes('view') || toolName.includes('read')) {
            readFilesSet.add(f);
          } else {
            modifiedFilesSet.add(f);
          }
        });
      }

      // Collect concise tool summaries
      if (tool.input?.toolSummary && recentActionsList.length < 8) {
        const act = tool.input.toolSummary;
        if (!recentActionsList.includes(act)) recentActionsList.push(act);
      } else if (tool.input?.CommandLine && recentActionsList.length < 8) {
        const cmd = tool.input.CommandLine.split('\n')[0].substring(0, 70);
        if (!recentActionsList.includes(`Ran \`${cmd}\``)) recentActionsList.push(`Ran \`${cmd}\``);
      }
    }
  }

  // Format and prioritize modified files list
  const cwd = session.meta?.cwd || process.cwd();
  const formatFilePath = (f) => {
    let clean = f.replace(/\\/g, '/');
    if (cwd && clean.startsWith(cwd)) {
      clean = clean.substring(cwd.length).replace(/^\/+/, '');
    }
    return clean;
  };

  const modifiedFiles = Array.from(modifiedFilesSet).map(formatFilePath).slice(0, 10);
  const readFiles = Array.from(readFilesSet).map(formatFilePath).filter(f => !modifiedFiles.includes(f)).slice(0, 6);

  // 3. Extract last assistant conclusion / state
  const lastTurn = session.turns[session.turns.length - 1];
  let lastDecision = (lastTurn.assistantMessage || '').trim();
  // Strip code fences or markdown boilerplate for brevity
  lastDecision = lastDecision.replace(/```[\s\S]*?```/g, '[Code snippet]').trim();
  if (lastDecision.length > 350) lastDecision = lastDecision.substring(0, 350) + '...';

  // 4. Token metrics and savings estimation
  const lastTurnInput = lastTurn?.tokenUsage?.input_tokens || 0;
  const tokensSavedPerTurn = Math.max(lastTurnInput - 2000, 0);
  const isBloated = session.turns.length >= 12 || lastTurnInput > 100000;

  // 5. Construct comprehensive, ready-to-paste Clean Handoff prompt
  const filesListMd = modifiedFiles.length > 0 
    ? modifiedFiles.map(f => `- \`${f}\``).join('\n') 
    : '- Workspace codebase';

  const readFilesMd = readFiles.length > 0
    ? `\n**Referenced Context Files**:\n${readFiles.map(f => `- \`${f}\``).join('\n')}`
    : '';

  const directivesMd = uniqueDirectives.length > 0
    ? uniqueDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')
    : `1. ${latestPrompt}`;

  const recentActionsMd = recentActionsList.length > 0
    ? `\n**Recent Accomplishments & Actions**:\n${recentActionsList.map(a => `- ${a}`).join('\n')}`
    : '';

  const summaryPrompt = `# 🚀 Project Continuation & Clean Session Handoff

## 📌 Context & High-Level Objective
${initialGoal}

## 🎯 Recent User Directives
${directivesMd}

## 📂 Active Modified Files
${filesListMd}${readFilesMd}
${recentActionsMd}

## 🔄 Current Progress & Working State
${lastDecision ? lastDecision : 'Completed latest implementation step successfully.'}

## ⚡ Next Steps for the New Agent
1. Inspect the active files above using progressive disclosure (read targeted line slices, not entire files).
2. Continue fulfilling the latest directive: "${latestPrompt.substring(0, 120)}${latestPrompt.length > 120 ? '...' : ''}".
3. Keep tool outputs, test runs, and responses concise to maintain a lean context window.`;

  return {
    sessionId: session.sessionId,
    threadName: session.threadName,
    agentLabel,
    agentIcon,
    taskGoal: initialGoal,
    latestPrompt,
    userDirectives: uniqueDirectives,
    modifiedFiles,
    readFiles,
    recentActions: recentActionsList,
    lastDecision,
    turnCount: session.turns.length,
    lastTurnInputTokens: lastTurnInput,
    tokensSavedEstimate: tokensSavedPerTurn,
    isBloated,
    summaryPrompt
  };
}

