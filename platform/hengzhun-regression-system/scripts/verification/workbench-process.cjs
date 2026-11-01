'use strict'
// Isolated test process only: no production endpoint/model/environment loader.
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { WorkbenchRepository } = require('../../dist/harness/src/workbench-repository.js')
process.once('message', async ({ options, namespace, operations }) => {
  const database = await HarnessDatabase.open(options)
  const repository = new WorkbenchRepository(database)
  process.send({ ready: true })
  process.once('message', async () => {
    try {
      const values = []
      for (const { name, input } of operations) values.push(await repository.execute(name, namespace, input))
      await database.close()
      process.send({ ok: true, values }, () => process.exit(0))
    } catch (error) {
      await database.close()
      process.send({ ok: false, code: error.errorCode, status: error.status }, () => process.exit(0))
    }
  })
})
