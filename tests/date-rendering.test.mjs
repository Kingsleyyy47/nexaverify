import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import React, { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

test('initial date rendering is identical across server and visitor time zones', async () => {
  const { transform } = require('next/dist/build/swc');
  let source = await fs.readFile(new URL('../components/LocalDateTime.js', import.meta.url), 'utf8');
  source = source.replace(/^import[^;]+;\r?\n/gm, '');
  globalThis.__dateTest = { React, useEffect, useState };
  const result = await transform('const { React, useEffect, useState } = globalThis.__dateTest;\n' + source, {
    filename:'LocalDateTime.js', jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'es6'}
  });
  const {default:LocalDateTime} = await import('data:text/javascript;base64,'+Buffer.from(result.code).toString('base64'));
  const previous = process.env.TZ;
  try {
    for(const mode of ['datetime','date','time']) {
      const rendered=[];
      for(const zone of ['UTC','America/Los_Angeles','Africa/Lagos']) {
        process.env.TZ=zone;
        rendered.push(renderToStaticMarkup(React.createElement(LocalDateTime,{value:'2026-10-02T00:30:00Z',mode})));
      }
      assert.equal(new Set(rendered).size,1);
    }
    assert.equal(renderToStaticMarkup(React.createElement(LocalDateTime,{value:'invalid',fallback:'missing'})),'missing');
  } finally {
    if(previous === undefined)delete process.env.TZ;else process.env.TZ=previous;
    delete globalThis.__dateTest;
  }
});
