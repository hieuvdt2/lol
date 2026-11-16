// Quiz cửa hang do server ra đề và chấm.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { QUESTIONS, gradeAnswer, publicQuestions } from '../../server/lib/quiz.mjs'
import { startServer } from '../helpers/server.mjs'

test('ngân hàng câu hỏi: id duy nhất, 4 lựa chọn duy nhất, đáp án đúng nằm trong lựa chọn, văn bản không rỗng', () => {
  assert.ok(QUESTIONS.length >= 10)
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length)
  for (const q of QUESTIONS) {
    assert.ok(q.q.trim().length > 5, q.id)
    assert.equal(q.answers.length, 4, q.id)
    assert.equal(new Set(q.answers.map((a) => a.id)).size, 4, q.id)
    assert.equal(new Set(q.answers.map((a) => a.text)).size, 4, `${q.id}: lựa chọn trùng`)
    assert.ok(q.answers.some((a) => a.id === q.correct), q.id)
    assert.ok(q.answers.every((a) => a.text.trim().length > 0), q.id)
  }
  // đáp án đúng không dồn vào một vị trí (người chơi đoán theo vị trí được)
  const positions = new Set(QUESTIONS.map((q) => q.correct))
  assert.ok(positions.size >= 3, `chỉ ${positions.size} vị trí đáp án đúng`)
})

test('publicQuestions không lộ đáp án đúng, và sửa kết quả trả về không làm hỏng ngân hàng', () => {
  const list = publicQuestions()
  assert.equal(list.length, QUESTIONS.length)
  assert.ok(!JSON.stringify(list).includes('correct'))
  list[0].answers[0].text = 'ĐÃ SỬA'
  list[0].q = 'ĐÃ SỬA'
  assert.notEqual(QUESTIONS[0].answers[0].text, 'ĐÃ SỬA')
  assert.notEqual(QUESTIONS[0].q, 'ĐÃ SỬA')
})

test('gradeAnswer: đúng/sai kèm đáp án đúng; dữ liệu lạ → null', () => {
  const q = QUESTIONS[0]
  const wrong = q.answers.find((a) => a.id !== q.correct).id
  assert.deepEqual(gradeAnswer(q.id, q.correct), { correct: true, correctAnswerId: q.correct })
  assert.deepEqual(gradeAnswer(q.id, wrong), { correct: false, correctAnswerId: q.correct })
  for (const [a, b] of [['không-có', 'a'], [q.id, 'z'], [q.id, ''], [q.id, 1], [1, 'a'], [null, null], [undefined, 'a'], ['__proto__', 'a'], ['constructor', 'a']]) {
    assert.equal(gradeAnswer(a, b), null, `${a}/${b}`)
  }
})

const servers = {}
before(async () => {
  servers.main = await startServer({ BOTS: '0' }, { ready: 'http' })
})
after(async () => {
  for (const s of Object.values(servers)) await s.stop()
})
const post = (server, body, headers = {}) => fetch(server.url + '/api/quiz/answer', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

test('GET /api/quiz trả {questions} không có đáp án đúng', async () => {
  const res = await fetch(servers.main.url + '/api/quiz')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.questions.length, QUESTIONS.length)
  assert.ok(!JSON.stringify(body).includes('correct'))
  for (const q of body.questions) assert.deepEqual(Object.keys(q).sort(), ['answers', 'id', 'q'])
})

test('POST /api/quiz/answer chấm đúng; dữ liệu xấu → 400; Origin lạ → 403; GET → không chấm được', async () => {
  const q = QUESTIONS[2]
  const wrong = q.answers.find((a) => a.id !== q.correct).id
  assert.deepEqual(await (await post(servers.main, { questionId: q.id, answerId: q.correct })).json(), { correct: true, correctAnswerId: q.correct })
  assert.deepEqual(await (await post(servers.main, { questionId: q.id, answerId: wrong })).json(), { correct: false, correctAnswerId: q.correct })
  for (const bad of [{ questionId: 'x', answerId: 'a' }, { questionId: q.id }, {}, 'không phải json', '[]']) {
    assert.equal((await post(servers.main, bad)).status, 400, JSON.stringify(bad))
  }
  assert.equal((await post(servers.main, { questionId: q.id, answerId: q.correct }, { origin: 'https://evil.example' })).status, 403)
  const get = await fetch(servers.main.url + '/api/quiz/answer')
  assert.ok(get.status === 404 || get.status === 405, `GET → ${get.status}`)
})

test('quá nhiều yêu cầu quiz từ một IP bị giới hạn (429)', async () => {
  const s = await startServer({ BOTS: '0', QUIZ_RATE_PER_MIN: '5' }, { ready: 'http' })
  try {
    const codes = []
    for (let i = 0; i < 9; i += 1) codes.push((await fetch(s.url + '/api/quiz')).status)
    assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200])
    assert.ok(codes.slice(5).every((c) => c === 429), codes.join())
  } finally {
    await s.stop()
  }
})
