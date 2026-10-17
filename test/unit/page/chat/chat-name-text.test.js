// What a chat box says with Channel name in chat boxes on (src/page/chat/chat-name-text.js): your text with
// {channel} replaced by the channel's name.
const test = require('node:test');
const assert = require('node:assert/strict');

test('the chat box text: {channel} is the name, empty is just the name, and without {channel} the name goes at the end', async () => {
  const { chatNameText, CHAT_NAME_IDEAS } = await import('../../../../src/page/chat/chat-name-text.js');
  assert.equal(chatNameText('', 'Bestenya'), 'Bestenya');
  assert.equal(chatNameText(null, 'Bestenya'), 'Bestenya');
  assert.equal(chatNameText('   ', 'Bestenya'), 'Bestenya', 'only spaces: empty');
  assert.equal(chatNameText('{channel}', 'Bestenya'), 'Bestenya');
  assert.equal(chatNameText('Chat in {channel}', 'Bestenya'), 'Chat in Bestenya');
  assert.equal(chatNameText('→ {channel}', 'Bestenya'), '→ Bestenya');
  assert.equal(chatNameText('{channel} ({channel})', 'Bob'), 'Bob (Bob)', 'every {channel}');
  assert.equal(chatNameText('Typing in', 'Bestenya'), 'Typing in Bestenya', 'no {channel}: the name at the end');
  assert.equal(chatNameText('  Message   {channel}  ', 'Bestenya'), 'Message Bestenya', 'spaces tidied');
  // a name with markup characters stays exactly as it is (it's text in the site's page)
  assert.equal(chatNameText('Chat in {channel}', '<b>"x"</b>'), 'Chat in <b>"x"</b>');
  // at most 60 characters of your text
  assert.equal(chatNameText('x'.repeat(80) + '{channel}', 'N'), 'x'.repeat(60) + ' N', 'cut at 60, so its {channel} went: the name at the end');
  assert.equal(chatNameText('Chat', undefined), 'Chat');
  assert.ok(CHAT_NAME_IDEAS.includes('{channel}') && CHAT_NAME_IDEAS.every(t => t.includes('{channel}')), 'every suggestion has the name in it');
});
