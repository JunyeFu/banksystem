import {EncryptedSessionStore} from '../src/session-store.mjs'
import {connectSessionPersistence} from '../src/session-persistence.mjs'
const persistence=await connectSessionPersistence({url:process.env.TEST_SESSION_MCP_URL,token:process.env.TEST_SESSION_MCP_TOKEN})
const store=await new EncryptedSessionStore({persistence}).initialize()
try {
  await store.update(process.env.TEST_SESSION_ID,process.env.TEST_SESSION_IDENTITY,async payload=>{
    process.send('READY');await new Promise(resolve=>process.once('message',resolve))
    payload.events.push({type:process.env.TEST_SESSION_WRITER});return payload
  })
  process.send({status:'SAVED'})
}catch(error){process.send({status:'REJECTED',code:error.code})}
finally{await persistence.close();process.disconnect()}
