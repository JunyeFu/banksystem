'use strict'
const assert=require('node:assert/strict')
const path=require('node:path')
const {spawnSync}=require('node:child_process')
const test=require('node:test')
const {assertTapSuccess}=require('../run-registered-tests.cjs')

test('formal and supplemental readonly capacity contracts run without live banking or models',()=>{
  const product=path.resolve(__dirname,'../..'),repository=path.resolve(product,'../..')
  const node=path.join(product,'runtime/node-v24.19.0-win-x64/node.exe')
  const environment={...process.env};delete environment.NODE_TEST_CONTEXT
  const files=['agent-capacity.test.mjs','readonly-capacity.test.mjs'].map(name=>path.join(repository,'scripts/test/rf057',name))
  const result=spawnSync(node,['--test','--test-reporter=tap',...files],{cwd:repository,env:environment,encoding:'utf8',windowsHide:true})
  assert.equal(result.status,0,`Capacity contracts failed.\n${result.stdout}\n${result.stderr}`)
  assertTapSuccess(result.stdout)
})
