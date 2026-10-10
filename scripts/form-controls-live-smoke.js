'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  session
} = require('electron');
const { AgentService, validateToolArguments } = require('../src/main/agent-service');
const { BrowserController } = require('../src/main/browser-controller');

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(process.cwd(), '.qa-form-controls-profile'));
app.enableSandbox();

const fixture = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>BrowsMe form controls fixture</title>
    <style>
      body { font: 16px sans-serif; margin: 20px; }
      label, fieldset, [role], [contenteditable] {
        display: block;
        margin: 7px 0;
      }
      [contenteditable], [role="option"], [role="checkbox"],
      [role="radio"], [role="switch"] {
        border: 1px solid #777;
        min-height: 24px;
        min-width: 160px;
        padding: 4px;
      }
      select[multiple] { min-height: 90px; }
    </style>
  </head>
  <body>
    <form method="post" action="/submitted">
      <label>Full name <input name="fullName" type="text"></label>
      <label>Email address <input name="email" type="email"></label>
      <label>Account password <input name="password" type="password"></label>
      <label>Search terms <input name="search" type="search"></label>
      <label>Phone number <input name="phone" type="tel"></label>
      <label>Profile URL <input name="profileUrl" type="url"></label>
      <label>Quantity <input name="quantity" type="number"></label>
      <label>Birthday <input name="birthday" type="date"></label>
      <label>Meeting time <input name="meetingTime" type="time"></label>
      <label>Appointment <input name="appointment" type="datetime-local"></label>
      <label>Billing month <input name="billingMonth" type="month"></label>
      <label>Delivery week <input name="deliveryWeek" type="week"></label>
      <label>Favorite color <input name="favoriteColor" type="color"></label>
      <label>Priority <input name="priority" type="range" min="0" max="10"></label>
      <label>Notes <textarea name="notes"></textarea></label>

      <fieldset>
        <legend>Topics</legend>
        <label>Security <input name="topics" value="security" type="checkbox"></label>
        <label>Automation <input name="topics" value="automation" type="checkbox"></label>
        <label>Design <input name="topics" value="design" type="checkbox"></label>
      </fieldset>

      <fieldset>
        <legend>Preferred channel</legend>
        <label>Email channel <input name="channel" value="email" type="radio"></label>
        <label>SMS channel <input name="channel" value="sms" type="radio"></label>
      </fieldset>

      <label>Plan
        <select name="plan" aria-label="Plan">
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
        </select>
      </label>

      <label>Size-only city
        <select name="city" aria-label="Size-only city" size="4">
          <option value="colombo">Colombo</option>
          <option value="galle">Galle</option>
          <option value="kandy">Kandy</option>
          <option value="jaffna">Jaffna</option>
        </select>
      </label>

      <label>Interests
        <select name="interests" aria-label="Interests" multiple>
          <option value="email" selected>Email</option>
          <option value="sms">SMS</option>
          <option value="push">Push</option>
          <option value="disabled" disabled>Disabled option</option>
        </select>
      </label>

      <label>Ambiguous interests
        <select aria-label="Ambiguous interests" multiple>
          <option value="first">Duplicate</option>
          <option value="second">Duplicate</option>
          <option value="shared">First shared value</option>
          <option value="shared">Second shared value</option>
        </select>
      </label>

      <button type="submit">Submit answers</button>
    </form>

    <label>Resume file <input type="file" accept=".pdf,.docx"></label>
    <div contenteditable aria-label="Rich answer"></div>
    <div contenteditable="plaintext-only" aria-label="Plain editable answer"></div>

    <div
      role="checkbox"
      aria-label="ARIA terms"
      aria-checked="false"
      tabindex="0"
    >ARIA terms</div>
    <div
      role="switch"
      aria-label="ARIA notifications"
      aria-checked="false"
      tabindex="0"
    >ARIA notifications</div>
    <div role="radiogroup" aria-label="ARIA delivery">
      <div
        role="radio"
        aria-label="ARIA standard"
        aria-checked="true"
        tabindex="0"
      >ARIA standard</div>
      <div
        role="radio"
        aria-label="ARIA express"
        aria-checked="false"
        tabindex="0"
      >ARIA express</div>
    </div>

    <button
      type="button"
      role="combobox"
      aria-label="ARIA tags"
      aria-controls="aria-options"
      aria-expanded="true"
    >Choose tags</button>
    <div
      id="aria-options"
      role="listbox"
      aria-label="ARIA tag options"
      aria-multiselectable="true"
    >
      <div role="option" aria-label="ARIA alpha" aria-selected="false" tabindex="0">Alpha</div>
      <div role="option" aria-label="ARIA beta" aria-selected="false" tabindex="0">Beta</div>
    </div>

    <script>
      for (const control of document.querySelectorAll(
        '[role="checkbox"], [role="switch"]'
      )) {
        control.addEventListener('click', () => {
          control.setAttribute(
            'aria-checked',
            String(control.getAttribute('aria-checked') !== 'true')
          );
        });
      }
      const ariaRadios = Array.from(document.querySelectorAll('[role="radio"]'));
      for (const control of ariaRadios) {
        control.addEventListener('click', () => {
          for (const radio of ariaRadios) {
            radio.setAttribute('aria-checked', String(radio === control));
          }
        });
      }
      for (const option of document.querySelectorAll('[role="option"]')) {
        option.addEventListener('click', () => {
          option.setAttribute(
            'aria-selected',
            String(option.getAttribute('aria-selected') !== 'true')
          );
        });
      }
    </script>
  </body>
</html>`;

function findElement(snapshot, name) {
  const element = snapshot.elements.find((candidate) => candidate.name === name);
  assert.ok(element, `Fixture control not found in snapshot: ${name}`);
  return element;
}

async function waitForSnapshot(controller, tabId) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 8000) {
    try {
      const snapshot = await controller.snapshot(tabId);
      if (
        snapshot.title === 'BrowsMe form controls fixture' &&
        snapshot.readyState !== 'loading'
      ) {
        return snapshot;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw lastError || new Error('Form fixture did not become ready.');
}

async function readControlState(controller, tabId) {
  return controller.getTab(tabId).view.webContents.executeJavaScript(`(() => ({
    values: Object.fromEntries(
      Array.from(document.querySelectorAll('input,textarea')).map(
        (control) => [control.name || control.getAttribute('aria-label'), control.value]
      )
    ),
    security: document.querySelector('input[value="security"]').checked,
    automation: document.querySelector('input[value="automation"]').checked,
    design: document.querySelector('input[value="design"]').checked,
    emailChannel: document.querySelector('input[value="email"][type="radio"]').checked,
    smsChannel: document.querySelector('input[value="sms"][type="radio"]').checked,
    rich: document.querySelector('[aria-label="Rich answer"]').innerText,
    plain: document.querySelector('[aria-label="Plain editable answer"]').innerText,
    ariaTerms: document.querySelector('[aria-label="ARIA terms"]').getAttribute('aria-checked'),
    ariaNotifications: document.querySelector('[aria-label="ARIA notifications"]').getAttribute('aria-checked'),
    ariaStandard: document.querySelector('[aria-label="ARIA standard"]').getAttribute('aria-checked'),
    ariaExpress: document.querySelector('[aria-label="ARIA express"]').getAttribute('aria-checked'),
    ariaAlpha: document.querySelector('[aria-label="ARIA alpha"]').getAttribute('aria-selected'),
    ariaBeta: document.querySelector('[aria-label="ARIA beta"]').getAttribute('aria-selected'),
    interests: Array.from(document.querySelector('[aria-label="Interests"]').selectedOptions)
      .map((option) => option.value)
  }))()`);
}

async function main() {
  await app.whenReady();

  let submittedBodyResolve;
  const submittedBody = new Promise((resolve) => {
    submittedBodyResolve = resolve;
  });
  const server = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/submitted') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        submittedBodyResolve(body);
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end('<!doctype html><title>Answers submitted</title><p>received</p>');
      });
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(fixture);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const window = new BrowserWindow({
    show: true,
    x: -10000,
    y: -10000,
    skipTaskbar: true,
    width: 1100,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });
  const controller = new BrowserController({
    window,
    profileSession: session.fromPartition(`browsme-form-smoke-${Date.now()}`),
    emitState: () => {},
    emitToast: () => {},
    requestApproval: async () => true,
    requestPermission: async () => false,
    emitDownloads: () => {}
  });
  const agent = new AgentService({
    browser: controller,
    settings: {},
    memory: { getConversation: () => [] },
    emit: () => {}
  });
  const run = {
    id: 'form-controls-live',
    scope: 'active',
    currentTabId: '',
    allowedTabIds: new Set(),
    abortController: new AbortController()
  };

  try {
    const port = server.address().port;
    const tabId = await controller.createTab(`http://127.0.0.1:${port}/`, {
      activate: true,
      source: 'user'
    });
    controller.beginAgentApprovalRun(run.id, [tabId]);
    run.currentTabId = tabId;
    run.allowedTabIds.add(tabId);

    let snapshot = await waitForSnapshot(controller, tabId);
    const interests = findElement(snapshot, 'Interests');
    assert.equal(interests.multiple, true);
    assert.deepEqual(interests.selectedLabels, ['Email']);
    assert.deepEqual(interests.selectedValues, ['email']);
    assert.ok(Array.isArray(interests.options));
    assert.deepEqual(
      interests.options,
      ['Email', 'SMS', 'Push', 'Disabled option']
    );
    assert.ok(Array.isArray(interests.optionDetails));
    assert.deepEqual(
      interests.optionDetails.map((option) => ({
        label: option.label,
        value: option.value,
        selected: option.selected,
        disabled: option.disabled
      })),
      [
        { label: 'Email', value: 'email', selected: true, disabled: false },
        { label: 'SMS', value: 'sms', selected: false, disabled: false },
        { label: 'Push', value: 'push', selected: false, disabled: false },
        {
          label: 'Disabled option',
          value: 'disabled',
          selected: false,
          disabled: true
        }
      ]
    );
    const sizeOnly = findElement(snapshot, 'Size-only city');
    assert.equal(sizeOnly.multiple, false);
    assert.equal(sizeOnly.role, 'listbox');

    for (const name of ['Rich answer', 'Plain editable answer']) {
      const editable = findElement(snapshot, name);
      assert.equal(editable.role, 'textbox');
      assert.equal(editable.valueSet, false);
    }
    for (const [name, type] of [
      ['Email address', 'email'],
      ['Search terms', 'search'],
      ['Phone number', 'tel'],
      ['Profile URL', 'url'],
      ['Quantity', 'number'],
      ['Birthday', 'date'],
      ['Meeting time', 'time'],
      ['Appointment', 'datetime-local'],
      ['Billing month', 'month'],
      ['Delivery week', 'week'],
      ['Favorite color', 'color'],
      ['Priority', 'range']
    ]) {
      assert.equal(findElement(snapshot, name).type, type);
    }
    assert.equal(findElement(snapshot, 'Account password').password, true);
    const fileInput = findElement(snapshot, 'Resume file');
    assert.equal(fileInput.type, 'file');
    assert.equal(fileInput.role, 'file-input');
    assert.equal(fileInput.accept, '.pdf,.docx');

    for (const [name, value] of [
      ['Full name', 'JD Tester'],
      ['Email address', 'jd@example.test'],
      ['Account password', 'form-secret'],
      ['Search terms', 'browser forms'],
      ['Phone number', '+94770000000'],
      ['Profile URL', 'https://example.test/profile'],
      ['Notes', 'Native controls completed'],
      ['Rich answer', 'Rich response'],
      ['Plain editable answer', 'Plain response']
    ]) {
      snapshot = await controller.snapshot(tabId);
      const result = await controller.typeText(
        tabId,
        findElement(snapshot, name).ref,
        value,
        { clear: true, submit: false }
      );
      assert.equal(
        result.fieldEvidence.expectedLengthMatched,
        true,
        `${name} was not verified after typing`
      );
    }

    for (const [name, value] of [
      ['Quantity', '4'],
      ['Birthday', '2026-08-10'],
      ['Meeting time', '09:30'],
      ['Appointment', '2026-08-10T09:30'],
      ['Billing month', '2026-08'],
      ['Delivery week', '2026-W32'],
      ['Favorite color', '#336699'],
      ['Priority', '8']
    ]) {
      snapshot = await controller.snapshot(tabId);
      const args = {
        ref: findElement(snapshot, name).ref,
        value
      };
      validateToolArguments('page_set_value', args);
      const result = await agent.executeTool(run, 'page_set_value', args);
      assert.equal(result.stateMatched, true, `${name} value was not verified`);
    }

    snapshot = await controller.snapshot(tabId);
    let invalidRangeRejected = false;
    try {
      await agent.executeTool(run, 'page_set_value', {
        ref: findElement(snapshot, 'Priority').ref,
        value: '11'
      });
    } catch (error) {
      invalidRangeRejected = /constraint|range|invalid/i.test(error.message);
    }
    assert.equal(invalidRangeRejected, true);

    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'Security').ref,
      true
    );
    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'Automation').ref,
      true
    );
    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'Design').ref,
      true
    );
    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'Design').ref,
      false
    );

    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'Email channel').ref,
      true
    );
    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'SMS channel').ref,
      true
    );

    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'ARIA terms').ref,
      true
    );
    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'ARIA notifications').ref,
      true
    );
    snapshot = await controller.snapshot(tabId);
    await controller.setChecked(
      tabId,
      findElement(snapshot, 'ARIA express').ref,
      true
    );

    snapshot = await controller.snapshot(tabId);
    await controller.click(tabId, findElement(snapshot, 'ARIA alpha').ref);
    snapshot = await controller.snapshot(tabId);
    await controller.click(tabId, findElement(snapshot, 'ARIA beta').ref);

    validateToolArguments('page_select', {
      ref: findElement(snapshot, 'Plan').ref,
      value: 'pro'
    });
    await agent.executeTool(run, 'page_select', {
      ref: findElement(snapshot, 'Plan').ref,
      value: 'pro'
    });

    snapshot = await controller.snapshot(tabId);
    await agent.executeTool(run, 'page_select', {
      ref: findElement(snapshot, 'Size-only city').ref,
      value: 'kandy'
    });

    snapshot = await controller.snapshot(tabId);
    assert.equal(findElement(snapshot, 'Size-only city').selectedValue, 'kandy');
    const replaceSelection = {
      ref: findElement(snapshot, 'Interests').ref,
      values: ['Email', 'Push'],
      mode: 'replace'
    };
    validateToolArguments('page_select', replaceSelection);
    await agent.executeTool(run, 'page_select', replaceSelection);

    snapshot = await controller.snapshot(tabId);
    assert.deepEqual(
      findElement(snapshot, 'Interests').selectedValues,
      ['email', 'push']
    );
    const addSelection = {
      ref: findElement(snapshot, 'Interests').ref,
      values: ['SMS'],
      mode: 'add'
    };
    validateToolArguments('page_select', addSelection);
    await agent.executeTool(run, 'page_select', addSelection);

    snapshot = await controller.snapshot(tabId);
    assert.deepEqual(
      findElement(snapshot, 'Interests').selectedValues,
      ['email', 'sms', 'push']
    );
    const removeSelection = {
      ref: findElement(snapshot, 'Interests').ref,
      values: ['Email'],
      mode: 'remove'
    };
    validateToolArguments('page_select', removeSelection);
    await agent.executeTool(run, 'page_select', removeSelection);

    snapshot = await controller.snapshot(tabId);
    assert.deepEqual(
      findElement(snapshot, 'Interests').selectedValues,
      ['sms', 'push']
    );

    const beforeRejectedSelection = findElement(snapshot, 'Interests').selectedValues;
    let disabledRejected = false;
    try {
      await agent.executeTool(run, 'page_select', {
        ref: findElement(snapshot, 'Interests').ref,
        values: ['Disabled option'],
        mode: 'add'
      });
    } catch (error) {
      disabledRejected = /disabled|option.*available|option.*select/i.test(
        error.message
      );
    }
    assert.equal(disabledRejected, true);
    snapshot = await controller.snapshot(tabId);
    assert.deepEqual(
      findElement(snapshot, 'Interests').selectedValues,
      beforeRejectedSelection
    );

    for (const ambiguousValue of ['Duplicate', 'shared']) {
      let ambiguousRejected = false;
      try {
        await agent.executeTool(run, 'page_select', {
          ref: findElement(snapshot, 'Ambiguous interests').ref,
          values: [ambiguousValue],
          mode: 'replace'
        });
      } catch (error) {
        ambiguousRejected = /ambiguous|multiple.*match/i.test(error.message);
      }
      assert.equal(
        ambiguousRejected,
        true,
        `Ambiguous option ${ambiguousValue} was not rejected`
      );
      snapshot = await controller.snapshot(tabId);
    }

    const state = await readControlState(controller, tabId);
    assert.equal(state.security, true);
    assert.equal(state.automation, true);
    assert.equal(state.design, false);
    assert.equal(state.emailChannel, false);
    assert.equal(state.smsChannel, true);
    assert.equal(state.rich, 'Rich response');
    assert.equal(state.plain, 'Plain response');
    assert.equal(state.values.quantity, '4');
    assert.equal(state.values.birthday, '2026-08-10');
    assert.equal(state.values.meetingTime, '09:30');
    assert.equal(state.values.appointment, '2026-08-10T09:30');
    assert.equal(state.values.billingMonth, '2026-08');
    assert.equal(state.values.deliveryWeek, '2026-W32');
    assert.equal(state.values.favoriteColor, '#336699');
    assert.equal(state.values.priority, '8');
    assert.equal(state.ariaTerms, 'true');
    assert.equal(state.ariaNotifications, 'true');
    assert.equal(state.ariaStandard, 'false');
    assert.equal(state.ariaExpress, 'true');
    assert.equal(state.ariaAlpha, 'true');
    assert.equal(state.ariaBeta, 'true');
    assert.deepEqual(state.interests, ['sms', 'push']);

    snapshot = await controller.snapshot(tabId);
    await controller.submitForm(
      tabId,
      findElement(snapshot, 'Submit answers').ref
    );
    const body = await Promise.race([
      submittedBody,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Form submission timed out.')), 5000);
      })
    ]);
    const submitted = new URLSearchParams(body);
    assert.equal(submitted.get('fullName'), 'JD Tester');
    assert.equal(submitted.get('email'), 'jd@example.test');
    assert.equal(submitted.get('birthday'), '2026-08-10');
    assert.equal(submitted.get('meetingTime'), '09:30');
    assert.equal(submitted.get('favoriteColor'), '#336699');
    assert.equal(submitted.get('priority'), '8');
    assert.equal(submitted.get('channel'), 'sms');
    assert.deepEqual(submitted.getAll('topics'), ['security', 'automation']);
    assert.deepEqual(submitted.getAll('interests'), ['sms', 'push']);

    process.stdout.write(`${JSON.stringify({
      passed: true,
      nativeTextControls: true,
      structuredNativeInputs: [
        'number',
        'date',
        'time',
        'datetime-local',
        'month',
        'week',
        'color',
        'range'
      ],
      fileInputRecognized: true,
      emptyContenteditable: true,
      plaintextOnlyContenteditable: true,
      checkboxGroup: true,
      radioGroup: true,
      singleSelect: true,
      sizeOnlySingleSelect: true,
      multipleSelectModes: ['replace', 'add', 'remove'],
      disabledAndAmbiguousOptionsRejected: true,
      ariaCheckedControls: ['checkbox', 'switch', 'radio'],
      ariaListboxOptions: true,
      repeatedFormAnswersSubmitted: true
    }, null, 2)}\n`);
  } finally {
    controller.endAgentApprovalRun(run.id);
    await controller.destroy();
    window.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
