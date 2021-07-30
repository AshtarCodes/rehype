import fs from 'fs'
import path from 'path'
import test from 'tape'
import vfile from 'to-vfile'
import clean from 'unist-util-remove-position'
import hast from 'hast-util-assert'
import unified from '../packages/rehype/node_modules/unified/index.js'
import parse from '../packages/rehype-parse/index.js'
import stringify from '../packages/rehype-stringify/index.js'
import {rehype} from '../packages/rehype/index.js'

const fragment = {fragment: true}

test('rehype().parse(file)', (t) => {
  t.equal(
    unified().use(parse).parse('Alfred').children.length,
    1,
    'should accept a `string`'
  )

  t.deepEqual(
    clean(unified().use(parse, fragment).parse('<img><span></span>'), true),
    {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'img',
          properties: {},
          children: []
        },
        {
          type: 'element',
          tagName: 'span',
          properties: {},
          children: []
        }
      ],
      data: {quirksMode: false}
    },
    'should close void elements'
  )

  t.deepEqual(
    clean(unified().use(parse, fragment).parse('<foo><span></span>'), true),
    {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'foo',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'span',
              properties: {},
              children: []
            }
          ]
        }
      ],
      data: {quirksMode: false}
    },
    'should not close unknown elements by default'
  )

  t.end()
})

test('rehype().stringify(ast, file, options?)', (t) => {
  t.throws(
    () => {
      unified().use(stringify).stringify(false)
    },
    /false/,
    'should throw when `ast` is not a node'
  )

  t.throws(
    () => {
      unified().use(stringify).stringify({type: 'unicorn'})
    },
    /unicorn/,
    'should throw when `ast` is not a valid node'
  )

  t.equal(
    unified().use(stringify).stringify({type: 'text', value: 'alpha < bravo'}),
    'alpha &#x3C; bravo',
    'should escape entities'
  )

  t.equal(
    unified()
      .use(stringify, {entities: {}})
      .stringify({type: 'text', value: 'alpha < bravo'}),
    'alpha &#x3C; bravo',
    'should encode entities (numbered by default)'
  )

  t.equal(
    unified()
      .use(stringify, {entities: {useNamedReferences: true}})
      .stringify({type: 'text', value: 'alpha < bravo'}),
    'alpha &lt; bravo',
    'should encode entities (numbered by default)'
  )

  t.equal(
    unified().use(stringify).stringify({type: 'element', tagName: 'img'}),
    '<img>',
    'should not close void elements'
  )

  t.equal(
    unified()
      .use(stringify, {closeSelfClosing: true})
      .stringify({type: 'element', tagName: 'img'}),
    '<img />',
    'should close void elements if `closeSelfClosing` is given'
  )

  t.equal(
    unified().use(stringify).stringify({type: 'element', tagName: 'foo'}),
    '<foo></foo>',
    'should not close unknown elements by default'
  )

  t.equal(
    unified()
      .use(stringify, {voids: 'foo'})
      .stringify({type: 'element', tagName: 'foo'}),
    '<foo>',
    'should close void elements if configured'
  )

  t.deepEqual(
    rehype()
      .processSync('<!doctypehtml>')
      .messages.map((d) => String(d)),
    [],
    'should not emit parse errors by default'
  )

  t.deepEqual(
    rehype()
      .data('settings', {emitParseErrors: true})
      .processSync('<!doctypehtml>')
      .messages.map((d) => String(d)),
    ['1:10-1:10: Missing whitespace before doctype name'],
    'should emit parse errors when `emitParseErrors: true`'
  )

  t.deepEqual(
    rehype()
      .data('settings', {
        emitParseErrors: true,
        missingWhitespaceBeforeDoctypeName: false
      })
      .processSync('<!doctypehtml>')
      .messages.map((d) => String(d)),
    [],
    'should ignore parse errors when the specific rule is turned off'
  )

  t.deepEqual(
    rehype()
      .data('settings', {
        emitParseErrors: true,
        missingWhitespaceBeforeDoctypeName: true
      })
      .processSync('<!doctypehtml>')
      .messages.map((d) => String(d)),
    ['1:10-1:10: Missing whitespace before doctype name'],
    'should emit parse errors when the specific rule is turned on'
  )

  t.deepEqual(
    rehype()
      .data('settings', {
        emitParseErrors: true,
        missingWhitespaceBeforeDoctypeName: 2
      })
      .processSync('<!doctypehtml>').messages[0].fatal,
    true,
    'should emit fatal parse errors when the specific rule is `2`'
  )

  t.deepEqual(
    rehype()
      .data('settings', {
        emitParseErrors: true,
        missingWhitespaceBeforeDoctypeName: 1
      })
      .processSync('<!doctypehtml>').messages[0].fatal,
    false,
    'should emit fatal parse errors when the specific rule is `1`'
  )

  t.end()
})

test('fixtures', (t) => {
  let index = -1
  const root = path.join('test', 'fixtures')
  const fixtures = fs.readdirSync(root)

  /* Check the next fixture. */
  function next() {
    const fixture = fixtures[++index]

    if (!fixture) {
      t.end()
      return
    }

    if (fixture.charAt(0) === '.') {
      setImmediate(next)
      return
    }

    const fp = path.join(root, fixture)

    setImmediate(next) // Queue next.

    t.test(fixture, (st) => {
      const file = vfile.readSync(path.join(fp, 'index.html'))
      let config = {}
      let tree
      let result

      file.dirname = ''

      try {
        config = JSON.parse(fs.readFileSync(path.join(fp, 'config.json')))
      } catch {}

      try {
        result = fs.readFileSync(path.join(fp, 'result.html'), 'utf8')
      } catch {}

      const node = rehype().data('settings', config).parse(file)

      try {
        tree = JSON.parse(fs.readFileSync(path.join(fp, 'index.json')))
      } catch {
        fs.writeFileSync(
          path.join(fp, 'index.json'),
          JSON.stringify(node, 0, 2) + '\n'
        )
        return
      }

      hast(node)

      st.deepEqual(tree, node, 'should parse `' + fixture + '`')

      const out = rehype().data('settings', config).stringify(node)

      if (result) {
        st.equal(out, result, 'should stringify `' + fixture + '`')
      } else {
        st.equal(out, String(file), 'should stringify `' + fixture + '` exact')
      }

      if (config.reprocess !== false) {
        st.deepEqual(
          clean(node),
          clean(rehype().data('settings', config).parse(out)),
          'should re-parse `' + fixture + '`'
        )
      }

      st.end()
    })
  }

  next()
})
