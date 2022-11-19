import express from 'express';
import dotenv from 'dotenv';
import { gitFactory } from './github.js';
import 'node-fetch';
import fetch from 'node-fetch';

if (!process.env.AWS_GIT_TOKEN) {
  dotenv.config();
  console.log('Dotenv config done');
}

const token = process.env.AWS_GIT_TOKEN;

//url for triggering action
const gitBuildUrl = 'https://api.github.com/repos/PROJ-A2022-G06-AWS-2-Cloud-Organization/PROJ-A2022-G06-AWS-2-Cloud/actions/workflows/github-actions-aws-cdk-deploy.yml/dispatches';
const mockBuildUrl = 'https://api.github.com/repos/PROJ-A2022-G06-AWS-2-Cloud-Organization/PROJ-A2022-G06-AWS-2-Cloud/actions/workflows/mock-deploy.yml/dispatches';

const app = express();
const port = 8080;
app.use(express.json());

app.get('/', (req, res) => {
  //addLogLine('Sir', 'Good day');
  res.send('Good day, Sir!');
});

app.get('/api/list', async (req, res) => {
  const json_response = await gitFactory.templateData();
  res.status(json_response.status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(json_response);
});

async function triggerBuild(buildUrl, options) {
  const response = await fetch(buildUrl, options);
  return response;
}


app.get('/api/status', async (req, res) => {
  const state = await getStatus();
  res.status(200);
  res.json(state);
});

// NOTE: I would call this in the api/status query coming from front instead of api/built query.
// build query gets to return and status query is waiting for next new state. 
async function getStatus(){
  // url and query string for getting workflow runs
  const timeStamp = new Date().toISOString().substring(0, 10);
  const queryString = `?created=${timeStamp}`;
  const getWorkFlowsUrl = `https://api.github.com/repos/PROJ-A2022-G06-AWS-2-Cloud-Organization/PROJ-A2022-G06-AWS-2-Cloud/actions/runs${queryString}`;


  const workflowRunHeaders = {'Accept' : 'application/vnd.github+json', 'Authorization' : `Bearer ${ token}`};//,
  
  const workflowRuns = await fetch(getWorkFlowsUrl, {headers: workflowRunHeaders});
  const jsonData = await workflowRuns.json();
  const jobs_url = jsonData.workflow_runs[0].jobs_url;
  const jobs = await fetch(jobs_url, {headers: workflowRunHeaders});
  const jobsData = await jobs.json();
  let stepInProgress = '';
  let stepNumber = 0;
  let errorMessage = '';
  const stepCount = jobsData.jobs[0].steps.length;
  for (const step of jobsData.jobs[0].steps) {
    if (step.status === 'in_progress' || (step.status === 'completed' && step.conclusion === 'failure')) {
      stepInProgress = step.name;
      stepNumber = step.number;
      if (step.conclusion === 'failure'){
        const checkRunUrl = jobsData.jobs[0].check_run_url;
        const checkRunData = await fetch(checkRunUrl, {headers: workflowRunHeaders});
        const checkRunJson = await checkRunData.json();
        const annotationsUrl = checkRunJson.output.annotations_url;
        const annotationsData = await fetch(annotationsUrl, {headers: workflowRunHeaders});
        const annotationsJson = await annotationsData.json();
        errorMessage = `${annotationsJson[0].message} / line: ${annotationsJson[0].start_line}`;
      }
    }
  }
  const returnObject = {
    status: jobsData.jobs[0].status,
    conclusion: jobsData.jobs[0].conclusion,
    stepName: stepInProgress,
    stepNumber: stepNumber,
    stepCount: stepCount,
    errorMessage: errorMessage,
  };
  return returnObject;
}

app.post('/api/build', async (req, res) => {
  const json = req.body;
  const packageName = json.package;
  const packageParams = json.parameters;
  const mockBuild = json.mock;
  console.log(mockBuild);

  const options = {
    method: 'post',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${ token}`
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: packageParams
    })
  };
  let response;

  if(mockBuild === true){
    response = await indexFactory.triggerBuild(mockBuildUrl, options);
  }
   else{
    response = await indexFactory.triggerBuild(gitBuildUrl, options);
   }
   
  if (response.status !== 204) {
    res.status(response.status);
    res.json(`Triggered build action failed - ${packageName}`);
    return;
  }
  res.status(200);
  res.json(`Triggered build action successfully - ${packageName}`);
});

app.post('/api/auth', async (req, res) => {
  const json = req.body;
  const username = json.username;
  // Dummy authentication.
  const users = [ 
    'Kosti', 
    'Onni', 
    'Miikka', 
    'Rauli', 
    'Veera', 
    'Hermanni', 
    'Linnea'
  ];

  if (users.includes(username)) {
    res.status(200);
  } else {
    res.status(404);
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json('Data: no-data');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

export default app;

export const indexFactory = {
  triggerBuild
};