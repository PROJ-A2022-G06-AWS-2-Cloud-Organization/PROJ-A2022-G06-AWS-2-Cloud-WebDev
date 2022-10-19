import express from 'express'
import { templateData } from './github.js'

const app = express()
const port = 8080
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Good day, Sir!');
})

app.get('/api/list', async (req, res) => {
  let json_response = await templateData();
  res.status(json_response.status)
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(json_response);
})

app.post('/api/build', async (req, res) => {
  const json = req.body;
  const packageName = json.package;
  const packageParams = json.parameters;

  res.status(200)
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json("(PLACEHOLDER) Building " + packageName);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

export default app;