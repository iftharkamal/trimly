export default defineEventHandler(event => useAuth().handler(toWebRequest(event)))
