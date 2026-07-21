'use strict'

const net = require('node:net')
const port = Number(process.env.HENGZHUN_TEST_PORT)
if (!Number.isInteger(port)) process.exit(2)
net.createServer().listen(port, '127.0.0.1', () => process.stdout.write('READY\n'))
