// Run inside a Kick chat page (turned into text, given what they need): Kick's chat box, emptied or filled in the way its
// channel page does it (chat/kick-poll.js, chat/kick-prediction.js, chat/kick-clip.js). The box is a Lexical editor:
// changing its text directly would leave the editor out of step, so it's given a new state instead.

// Empties it (it still says "/poll …"), as Kick's channel page does once the form opens
function kickClearBox(){
  const b = document.querySelector('[data-testid="chat-input"]'), ed = b && b.__lexicalEditor;
  if (!ed) return false;
  try {
    ed.setEditorState(ed.parseEditorState('{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'));
    return true;
  } catch { return false; }
}

// Puts text in it, ready to send with Enter, and puts the keyboard there
function kickFillBox(text){
  const b = document.querySelector('[data-testid="chat-input"]'), ed = b && b.__lexicalEditor;
  if (!ed) return false;
  const t = { detail: 0, format: 0, mode: 'normal', style: '', text: String(text), type: 'text', version: 1 };
  const para = { children: [t], direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1 };
  try {
    ed.setEditorState(ed.parseEditorState(JSON.stringify({ root: { children: [para], direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } })));
    ed.focus();
    return true;
  } catch { return false; }
}

export { kickClearBox, kickFillBox };
