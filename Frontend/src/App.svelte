<script>
  import { onMount, tick } from "svelte";
 
  let basepath = "";
  let DOCKER;
  if(typeof DOCKER_RUN === 'undefined') {
    DOCKER = false;
  } else {
    DOCKER = DOCKER_RUN;
  }
  if(!DOCKER) {
    basepath = "http://localhost:8080";
  } else {
    basepath = SERVER_CONNECTION + "://" + window.location.hostname;
  }

  const Views = {
    Login: "Login",
    Main: "Main",
    PackageSelection: "PackageSelection",
  };
  let currentView = Views.Login;
  const noPkg = { name: "Is loading packages..." };
  let availablePackages = [noPkg];
  let log = [];
  let latestStatus = "-";
  let selectedPackage = null;
  let dynamicParams = {};
  let packageName = "";
  // The build parameters.
  let secretkey = null;
  let accesskey = null;
  let region = null;
  // Login parameters
  let username = null;
  let password = null;
  let logInFailed = false;
  // For updating the build status
  let updating = false;
  let lastStatus = "";
  let lastStepName = "";
  // bool to ensure that backend calls aren't performed multiple times
  let waitingForActionToResolve = false;
  // bool for mock build checkbox state
  let mockAction = false;

  // Store previous runs to show in history view
  let historyRuns = [];
  let selectedHistoryRun = "";

  const update = () => {
    if (updating) {
      var buildName = dynamicParams["RESOURCE_NAME"]
        ? dynamicParams["RESOURCE_NAME"]
        : "Current build status";
      getBuildStatus(buildName);
    }
  };
  let clear;
  $: {
    clearInterval(clear);
    clear = setInterval(update, 5000);
  }
  function processLogin() {
    if (waitingForActionToResolve) return;
    waitingForActionToResolve = true;
    logInFailed = false;
    let loginInfo = {
      username: username,
      password: password,
    };
    const path = basepath + "/api/auth";
    const res = fetch(path, {
      method: "POST",
      body: JSON.stringify(loginInfo),
      headers: {
        "Content-Type": "application/json",
      },
    }).then((res) => {
      if (res.status == 200) {
        logMessage("Entered main view from login screen", "white");
        currentView = Views.Main;
        username = "";
        password = "";
      } else {
        logInFailed = true;
      }
      waitingForActionToResolve = false;
    });
  }
  function startNewEnvironment() {
    if (waitingForActionToResolve) return;
    waitingForActionToResolve = true;
    currentView = Views.PackageSelection;
    logMessage("Starting new environment", "white");
    const path = basepath + "/api/list";
    const response = fetch(path)
      .then((response) => response.json())
      .then((data) => {
        logMessage("Available package data fetched from backend", "turquoise");
        availablePackages = [];
        selectedPackage = null;
        availablePackages = Array.from(data.templates);
        waitingForActionToResolve = false;
      })
      .catch((error) => {
        logMessage(error, "salmon");
        availablePackages = [];
        selectedPackage = null;
        waitingForActionToResolve = false;
        currentView = Views.main;
        return [];
      });
  }
  function returnToMain() {
    logMessage("Returned to main view from package selection screen", "white");
    availablePackages = [noPkg];
    selectedPackage = null;
    currentView = Views.Main;
    secretkey = null;
    accesskey = null;
    region = null;
  }
  function resetDynamicParams() {
    dynamicParams = {};
    buildRequestValidation = false;
  }
  function on_key_down(event) {
    // Assuming you only want to handle the first press, we early
    // return to skip.
    if (event.repeat) return;
    switch (event.key) {
      case "Enter":
        if (currentView == Views.Login) {
          // By using `preventDefault`, it tells the Browser not to handle the
          // key stroke for its own shortcuts or text input.
          event.preventDefault();
          processLogin();
        }
        break;
    }
  }
  async function sendBuildRequest() {
    if (waitingForActionToResolve) return;
    waitingForActionToResolve = true;
    const path = basepath + "/api/build";
    let buildOptions = {
      package: selectedPackage.name,
      parameters: dynamicParams,
      mock: mockAction,
    };
    const res = await fetch(path, {
      method: "POST",
      body: JSON.stringify(buildOptions),
      headers: {
        "Content-Type": "application/json",
      },
    });
    logMessage("Sent build request to backend", "white");
    if (res.status == 200) {
      latestStatus = "Started";
      const json = await res.json();
      let result = JSON.stringify(json);
      logMessage("Received response from backend: " + result, "turquoise");
      updating = true;
      packageName = selectedPackage.name;
    } else {
      latestStatus = "Failed to Start";
      logMessage("Backend reported status: " + res.status, "yellow");
    }
    selectedPackage = null;
    currentView = Views.Main;
    waitingForActionToResolve = false;
  }


  onMount(async () =>{
    let path = basepath + "/api/history";
    let response = await fetch(path);
    if(response.status === 200){  
      let json = await response.json();
      historyRuns = json;
      
  }});

  const onHistorySelectChange = () => {
    let extraInfo = document.getElementById('history-view-extra');
    extraInfo.innerHTML = ''; //clear previous content
    let buildId = selectedHistoryRun.trim().substring(3,14);
    
    historyRuns.forEach(r => {
      if(r.build_id == buildId){
        let content = `Timestamp: ${r.timestamp}\nName: ${r.instance_name}\n`;
        extraInfo.appendChild(document.createTextNode(content));
        if(r.build_success == 0){
          extraInfo.appendChild(document.createTextNode(`Error message: ${r.error_message}`));
        }
      }
    })
    
  }

  async function getBuildStatus(buildName) {
    if (latestStatus === "Started") {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    const path = basepath + "/api/status";
    
    const body = {
        name: buildName,
        package: packageName,
        localrun: !DOCKER
      }
    
    const res = await fetch(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.status == 200) {
      let state = await res.json();
      if (state.status === "completed") {
        updating = false; // We got the last status.
        lastStatus = "";
        lastStepName = "";
        if (state.conclusion === "success") {
          latestStatus = "Success";
          logMessage(`${buildName}: Success!`, "lime");
        } else {
          latestStatus = "Failed";
          logMessage(
            `${buildName}: Failed! (${state.stepNumber}/${state.stepCount}) - ${state.stepName}`,
            "salmon"
          );
          logMessage(`Error: ${state.errorMessage}`, "salmon");
        }
        let path = basepath + "/api/history";
        let response = await fetch(path);
        if(response.status === 200){  
          let json = await response.json();
          historyRuns = json;
        }
        return;
      } else if (
        lastStatus === state.status &&
        lastStepName === state.stepName
      ) {
        // Status did not change, not logging.
        return;
      } else if (state.status === "in_progress") {
        latestStatus = "In Progress";
        lastStatus = state.status;
        lastStepName = state.stepName;
        logMessage(
          `${buildName}: In Progress (${state.stepNumber}/${state.stepCount}) - ${state.stepName}`,
          "turquoise"
        );
        return;
      } else {
        latestStatus = "In Progress";
        lastStatus = state.status;
        lastStepName = state.stepName;
        logMessage(`${buildName}: ${state.status}`, "turquoise");
        return;
      }
    }
  }
  async function logMessage(message, color = "white") {
    message =
      new Date(Date.now()).toISOString().substring(0, 23) +
      " - " +
      message +
      "\n";
    // format color string for style
    if (color.substring(0, 6) != "color:") {
      color = "color:" + color;
    }
    let messageObj = {
      message: message,
      style: color,
    };
    log.push(messageObj);
    if (log.length > 200) {
      log.splice(0, 1);
    }
    log = log;
    await tick();
    scrollToBottom(logScrollbar);
  }
  function clearLog() {
    log = [];
    logMessage("Cleared log", "white");
  }
  const scrollToBottom = async (node) => {
    if (node != undefined) {
      node.scroll({ top: node.scrollHeight, behavior: "smooth" });
    }
  };
  let logScrollbar;
  onMount(() => scrollToBottom(logScrollbar));
  let buildRequestValidation = false;
  logMessage("Initialized frontend", "white");
</script>

<svelte:window on:keydown={on_key_down} />

<h1>One AWS to go, Please!</h1>

{#if currentView == Views.Login}
  <input bind:value={username} type="text" placeholder="Username" />
  <input bind:value={password} type="password" placeholder="Password" />

  {#if logInFailed}
    <div class="error">Unauthorized</div>
  {/if}

  <div class="text-left checkbox-wrapper">
    <input type="checkbox" id="terms" class="checkbox" />
    <label class="checkbox-label" for="terms">Remember me</label>
  </div>

  <button class="login-button" id="login-button" on:click={processLogin}>
    Login
  </button>

  <div class="buttons-side-by-side">
    <button class="forgotpassword-button">Forgot password</button>
    <button class="signin-button">Sign in</button>
  </div>
{/if}

{#if currentView == Views.Main}
  <div class="column-container">
    <div class="view-column">
      <button id="start-button" on:click={startNewEnvironment}>
        Start new environment
      </button>
      <h2 id="history-view-header">Previously deployed packages</h2>
      <select size="10" id="history-view-select" bind:value = {selectedHistoryRun} on:change={onHistorySelectChange}>
        {#each historyRuns as run}
        {#if run.build_success == 1}            
        <option>
          {`Id: ${run.build_id} -- Name: ${run.instance_name} -- ${run.template_name} -- Success`}
        </option>
        {:else} 
        <option>
          {`Id: ${run.build_id} -- Name: ${run.instance_name} -- ${run.template_name} -- Failure`}
        </option>
        {/if}     
        {/each}
      </select>
      <div id="history-view-extra">

      </div>

    </div>

    <div class="view-column">
      <h2 for="log">Latest status: {latestStatus}</h2>
      <div>
        <ul bind:this={logScrollbar}>
          {#each log as messageObj}
            <li style={messageObj.style}>{messageObj.message}</li>
          {/each}
        </ul>
      </div>
      <button id="clearlogbtn" on:click={clearLog}> Clear log </button>
    </div>
  </div>
{/if}

{#if currentView == Views.PackageSelection}
  <div class="column-container">
    <div class="view-column">
      <h2>Available packages</h2>
      <select size="5" single bind:value={selectedPackage}>
        {#each availablePackages as pkg}
          {#if noPkg.name == pkg.name}
            <option disabled="true">
              {pkg.name}
            </option>
          {:else}
            <option value={pkg} on:click={resetDynamicParams}>
              {pkg.name}
            </option>
          {/if}
        {/each}
      </select>
      <button id="returnbtn" on:click={returnToMain}> Return </button>
    </div>

    <form
      class="view-column"
      id="buildRequestForm"
      class:buildRequestValidation
      on:submit|preventDefault={sendBuildRequest}
    >
      {#if selectedPackage}
        <h2>Selected package: {selectedPackage.name}</h2>
        <p>{selectedPackage.description}</p>

        {#each selectedPackage.parameters as param}
          <label for="dynamic-param">{param.displayName}</label>
          {#if param.type == null && param.internalName == "AWS_ACCESS_KEY_ID"}
            <input
              class="dynamic-param"
              required
              minlength="16"
              maxlength="128"
              pattern="[\w]+"
              title="Valid characters: a-z, A-Z and 0-9"
              bind:value={dynamicParams[param.internalName]}
            />
          {:else if param.type == null}
            <input
              class="dynamic-param"
              required
              bind:value={dynamicParams[param.internalName]}
            />
          {/if}
          {#if param.type == "password"}
            <input
              class="dynamic-param"
              type="password"
              required
              bind:value={dynamicParams[param.internalName]}
            />
          {/if}
          {#if param.type == "dropdown"}
            <select
              class="dynamic-param"
              required
              bind:value={dynamicParams[param.internalName]}
            >
              {#each param.options as option}
                <option value={option}>
                  {option}
                </option>
              {/each}
            </select>
          {/if}
        {/each}

        <label>
          <input type="checkbox" bind:checked={mockAction} />
          Run mock build
        </label>

        <button
          id="buildbtn"
          class="btn btn-full"
          on:click={() => (buildRequestValidation = true)}>Build</button
        >
      {/if}
    </form>
  </div>
{/if}

<style>
  :global(body) {
    background-color: #2b2b2b;
    color: #d6d6d6;
  }
  h1,
  h2 {
    text-align: center;
  }
  select {
    display: block;
    margin: 0 auto;
  }
  .column-container {
    display: flex;
    flex-wrap: wrap;
    flex-direction: row;
    height: 40vh;
  }
  .view-column {
    flex: 1;
    position: relative;
  }
  .view-column p {
    text-align: center;
  }
  input {
    display: block;
    border-radius: 25px;
    padding: 10px 15px;
    margin-left: auto;
    margin-right: auto;
  }
  .dynamic-param {
    width: 50%;
    display: block;
    margin: 0 auto;
  }
  label {
    margin-top: 5%;
    margin-bottom: 2%;
    text-align: center;
  }
  button {
    padding: 10px 50px 10px 50px;
    color: white;
    display: block;
    margin: 0 auto;
    transition-duration: 0.4s;
  }
  button:hover {
    background-color: white !important;
    color: black;
  }

  #login-button {
    border-radius: 25px;
    padding: 10px 40px;
    color: black;
    display: block;
    margin: auto !important;
  }

  .buttons-side-by-side {
    text-align: center;
    white-space: nowrap;
    margin-top: 10px;
    margin-left: -4rem;
  }

  .forgotpassword-button {
    border-radius: 25px;
    padding: 10px 35px;
    text-align: center;
    border: none;
    background-color: inherit !important;
    cursor: pointer;
    display: inline;
    color: white !important;
  }

  .signin-button {
    border-radius: 25px;
    padding: 10px 35px;
    text-align: center;
    border: none;
    background-color: inherit !important;
    cursor: pointer;
    display: inline;
    color: white !important;
  }

  #start-button {
    background-color: #2bb368;
    width: 50%;
    margin-top: 20px;
    margin-bottom: 50px;
  }

  #start-button:hover {
    border-color: #2bb368;
  }
  #buildbtn {
    background-color: #008cba;
    margin-top: 16%;
  }
  #buildbtn:hover {
    border-color: #008cba;
  }
  #returnbtn {
    background-color: #f44336;
    margin-top: 20%;
  }
  #returnbtn:hover {
    border-color: #f44336;
  }
  #clearlogbtn {
    background-color: #36a8f4;
    margin-top: 20%;
  }
  #clearlogbtn:hover {
    border-color: #36a8f4;
  }

  #history-view-header{
    margin: 20px;
  }

  #history-view-select{
    width: 80%;
    background-color: #383838;
    color: white;
  }

  #history-view-extra{
    margin: 2% auto;
    width: 80%;
    background-color: #383838;
    height: 20%;
    white-space: pre-wrap;
  }

  .error {
    display: block;
    margin-left: auto;
    margin-right: auto;
    color: #f00;
    text-align: center;
  }
  .buildRequestValidation input:invalid {
    border: 2px solid #c00;
  }
  .buildRequestValidation input:focus:invalid {
    outline: 2px solid #c00;
  }
  .buildRequestValidation select:invalid {
    border: 2px solid #c00;
  }
  .buildRequestValidation select:focus:invalid {
    outline: 2px solid #c00;
  }
  ul {
    list-style: none;
    max-height: 400px;
    min-height: 400px;
    margin: 0;
    overflow: auto;
    padding: 0;
    text-indent: 10px;
    background-color: #383838;
  }
  li {
    line-height: 25px;
  }

  .checkbox-wrapper {
    text-align: center;
    white-space: nowrap;
  }

  .checkbox {
    display: inline;
    width: auto;
  }

  .checkbox-label {
    white-space: normal;
    display: inline;
  }
</style>
