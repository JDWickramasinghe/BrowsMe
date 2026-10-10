'use strict';

function buildExecutionScript(fn, args) {
  return `(() => {
    const ensurePageObserver = ${ensurePageObserver.toString()};
    const elementAccessibleName = ${elementAccessibleName.toString()};
    const elementCheckedState = ${elementCheckedState.toString()};
    const elementMixedState = ${elementMixedState.toString()};
    const elementSelectedState = ${elementSelectedState.toString()};
    const elementIsEditable = ${elementIsEditable.toString()};
    const elementRole = ${elementRole.toString()};
    const effectiveFormSubmission = ${effectiveFormSubmission.toString()};
    const isDeepActiveElement = ${isDeepActiveElement.toString()};
    const findReferencedElement = ${findReferencedElement.toString()};
    const resolveReferencedOption = ${resolveReferencedOption.toString()};
    const resolveReferencedValue = ${resolveReferencedValue.toString()};
    return (${fn.toString()})(${JSON.stringify(args)});
  })()`;
}

function ensurePageObserver() {
  if (
    globalThis.__browsmeMutationObserver &&
    globalThis.__browsmeObservedDocument === document
  ) {
    return;
  }

  globalThis.__browsmeMutationObserver?.disconnect?.();
  globalThis.__browsmeMutationRevision = 0;
  globalThis.__browsmeLastMutationAt = 0;
  globalThis.__browsmeObserverInstalledAt = Date.now();
  globalThis.__browsmeObservedDocument = document;
  if (!document.documentElement) {
    return;
  }

  globalThis.__browsmeMutationObserver = new MutationObserver(() => {
    globalThis.__browsmeMutationRevision += 1;
    globalThis.__browsmeLastMutationAt = Date.now();
  });
  globalThis.__browsmeMutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true
  });
}

function elementAccessibleName(element) {
  const normalize = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const ariaLabel = normalize(element.getAttribute?.('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }
  const labelledBy = element.getAttribute?.('aria-labelledby');
  if (labelledBy) {
    const root = element.getRootNode?.();
    const label = labelledBy
      .split(/\s+/)
      .map((id) => (
        root?.getElementById?.(id) ||
        element.ownerDocument.getElementById(id)
      ))
      .filter(Boolean)
      .map((node) => normalize(node.innerText || node.textContent))
      .join(' ');
    if (label) {
      return normalize(label);
    }
  }
  if (element.labels?.length) {
    const label = Array.from(element.labels)
      .map((node) => normalize(node.innerText || node.textContent))
      .join(' ');
    if (label) {
      return normalize(label);
    }
  }
  const tag = String(element.tagName || '').toLowerCase();
  const type = String(element.type || element.getAttribute?.('type') || '').toLowerCase();
  if (tag === 'button') {
    const buttonText = normalize(element.innerText || element.textContent);
    if (buttonText) {
      return buttonText;
    }
    const imageText = Array.from(element.querySelectorAll?.('img[alt]') || [])
      .map((image) => normalize(image.alt))
      .filter(Boolean)
      .join(' ');
    if (imageText) {
      return normalize(imageText);
    }
  }
  if (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(type)) {
    const inputButtonText = normalize(element.value || element.alt);
    if (inputButtonText) {
      return inputButtonText;
    }
  }
  return normalize(
    element.placeholder ||
    element.title ||
    element.alt ||
    element.innerText ||
    element.textContent ||
    element.getAttribute?.('name')
  );
}

function elementCheckedState(element) {
  const tag = String(element.tagName || '').toLowerCase();
  const type = String(element.type || element.getAttribute?.('type') || '').toLowerCase();
  if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
    return Boolean(element.checked);
  }
  const role = String(element.getAttribute?.('role') || '').toLowerCase();
  if (
    [
      'checkbox',
      'menuitemcheckbox',
      'menuitemradio',
      'radio',
      'switch'
    ].includes(role) &&
    element.hasAttribute?.('aria-checked')
  ) {
    return element.getAttribute('aria-checked') === 'true';
  }
  return undefined;
}

function elementMixedState(element) {
  const tag = String(element.tagName || '').toLowerCase();
  const type = String(element.type || element.getAttribute?.('type') || '').toLowerCase();
  if (tag === 'input' && type === 'checkbox') {
    return Boolean(element.indeterminate);
  }
  return element.getAttribute?.('aria-checked') === 'mixed';
}

function elementSelectedState(element) {
  if (element.hasAttribute?.('aria-selected')) {
    return element.getAttribute('aria-selected') === 'true';
  }
  if (
    String(element.tagName || '').toLowerCase() === 'option' &&
    typeof element.selected === 'boolean'
  ) {
    return Boolean(element.selected);
  }
  return undefined;
}

function elementIsEditable(element) {
  const tag = String(element.tagName || '').toLowerCase();
  if (element.isContentEditable || tag === 'textarea') {
    return true;
  }
  if (tag !== 'input') {
    return false;
  }
  const type = String(element.type || element.getAttribute?.('type') || 'text').toLowerCase();
  return ![
    'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio',
    'range', 'reset', 'submit'
  ].includes(type);
}

function elementRole(element) {
  const explicit = String(element.getAttribute?.('role') || '').toLowerCase();
  if (explicit) {
    return explicit;
  }
  const tag = String(element.tagName || '').toLowerCase();
  const type = String(element.type || element.getAttribute?.('type') || '').toLowerCase();
  if (
    element.isContentEditable ||
    (
      element.hasAttribute?.('contenteditable') &&
      element.getAttribute('contenteditable') !== 'false'
    )
  ) {
    return 'textbox';
  }
  if (tag === 'a' && element.hasAttribute?.('href')) return 'link';
  if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(type))) return 'button';
  if (tag === 'select') {
    return element.multiple || Number(element.size) > 1
      ? 'listbox'
      : 'combobox';
  }
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (type === 'search') return 'searchbox';
    if (type === 'file') return 'file-input';
    if (type === 'color') return 'color-input';
    if (!['hidden'].includes(type)) return 'textbox';
  }
  return '';
}

function effectiveFormSubmission(element) {
  const form = element?.tagName === 'FORM'
    ? element
    : (element?.form || element?.closest?.('form'));
  if (!form) {
    return {
      form: null,
      submitter: null,
      action: '',
      method: ''
    };
  }

  const isSubmitControl = (candidate) => {
    const tag = String(candidate?.tagName || '').toLowerCase();
    const type = String(
      candidate?.type ||
      candidate?.getAttribute?.('type') ||
      (tag === 'button' ? 'submit' : '')
    ).toLowerCase();
    return (
      !candidate?.disabled &&
      (
        (tag === 'button' && type === 'submit') ||
        (tag === 'input' && ['submit', 'image'].includes(type))
      )
    );
  };

  let submitter = isSubmitControl(element) ? element : null;
  if (!submitter && element !== form) {
    submitter = Array.from(form.elements || []).find(isSubmitControl) || null;
  }
  const compact = (value, limit = 1200) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
  const baseTarget = compact(
    element.ownerDocument?.querySelector?.('base[target]')?.target,
    180
  );
  const submitterOverrides = {
    action: Boolean(submitter?.hasAttribute?.('formaction')),
    method: Boolean(submitter?.hasAttribute?.('formmethod')),
    target: Boolean(submitter?.hasAttribute?.('formtarget')),
    enctype: Boolean(submitter?.hasAttribute?.('formenctype'))
  };
  const effectiveAction = String(
    submitterOverrides.action
      ? submitter.formAction
      : (
          form.action ||
          element.ownerDocument?.location?.href ||
          ''
        )
  );
  const effectiveMethod = String(
    submitterOverrides.method
      ? submitter.formMethod
      : (form.method || 'get')
  ).toUpperCase();
  const effectiveTarget = String(
    submitterOverrides.target
      ? submitter.formTarget
      : (form.target || baseTarget || '')
  );
  const effectiveEnctype = String(
    submitterOverrides.enctype
      ? submitter.formEnctype
      : (form.enctype || 'application/x-www-form-urlencoded')
  ).toLowerCase();
  let requestShape = {
    supported: false,
    method: effectiveMethod,
    encoding: effectiveMethod === 'GET' ? 'query' : effectiveEnctype,
    payload: ''
  };
  try {
    const submitterType = String(
      submitter?.type ||
      submitter?.getAttribute?.('type') ||
      ''
    ).toLowerCase();
    if (
      submitterType !== 'image' &&
      (
        effectiveMethod === 'GET' ||
        effectiveEnctype === 'application/x-www-form-urlencoded'
      )
    ) {
      const params = new URLSearchParams();
      let supported = true;

      // Do not construct FormData here. FormData(form, submitter) dispatches the
      // page-observable `formdata` event, so merely taking a snapshot could let
      // a site mutate state or send a request. Instead, conservatively serialize
      // only native successful controls whose URL-encoded value is predictable.
      const normalizeEntry = (value) => String(value ?? '')
        .replace(/\r\n|\r|\n/g, '\r\n');
      const appendEntry = (name, value) => {
        params.append(normalizeEntry(name), normalizeEntry(value));
      };
      const controls = Array.from(form.elements || []);
      if (submitter && !controls.includes(submitter)) {
        supported = false;
      }

      for (const control of controls) {
        if (!supported) {
          break;
        }
        if (control?.form && control.form !== form) {
          continue;
        }
        const tag = String(control?.tagName || '').toLowerCase();
        const type = String(
          control?.type ||
          control?.getAttribute?.('type') ||
          (tag === 'button' ? 'submit' : '')
        ).toLowerCase();
        const name = String(control?.getAttribute?.('name') || '');
        const disabled = Boolean(
          control?.disabled ||
          control?.matches?.(':disabled')
        );
        if (disabled || !name) {
          continue;
        }

        if (tag === 'fieldset' || tag === 'output') {
          continue;
        }
        if (tag === 'button') {
          if (control === submitter && type === 'submit') {
            appendEntry(name, control.value);
          }
          continue;
        }
        if (tag === 'input') {
          if (['button', 'reset'].includes(type)) {
            continue;
          }
          if (type === 'submit') {
            if (control === submitter) {
              appendEntry(name, control.value);
            }
            continue;
          }
          if (type === 'image') {
            if (control === submitter) {
              supported = false;
            }
            continue;
          }
          if (type === 'file') {
            supported = false;
            continue;
          }
          if (['checkbox', 'radio'].includes(type) && !control.checked) {
            continue;
          }
          if (
            (type === 'hidden' && name.toLowerCase() === '_charset_') ||
            control.hasAttribute?.('dirname')
          ) {
            supported = false;
            continue;
          }
          appendEntry(name, control.value);
          continue;
        }
        if (tag === 'textarea') {
          if (control.hasAttribute?.('dirname')) {
            supported = false;
            continue;
          }
          appendEntry(name, control.value);
          continue;
        }
        if (tag === 'select') {
          for (const option of Array.from(control.options || [])) {
            const disabledByGroup = Boolean(
              option.parentElement?.tagName === 'OPTGROUP' &&
              option.parentElement.disabled
            );
            if (option.selected && !option.disabled && !disabledByGroup) {
              appendEntry(name, option.value);
            }
          }
          continue;
        }

        // Form-associated custom elements and legacy plugin-backed controls can
        // contribute entries that cannot be inspected without page-observable
        // behavior. Their live request must therefore remain page-scoped.
        supported = false;
      }

      if (
        supported &&
        submitter &&
        Boolean(submitter.disabled || submitter.matches?.(':disabled'))
      ) {
        supported = false;
      }
      if (
        supported &&
        submitter &&
        submitter.hasAttribute?.('dirname')
      ) {
        supported = false;
      }
      requestShape = {
        supported,
        method: effectiveMethod,
        encoding: effectiveMethod === 'GET' ? 'query' : 'urlencoded',
        payload: supported ? params.toString() : ''
      };
    }
  } catch {
    // Unsupported form encodings and file-backed bodies stay page-scoped.
  }
  const fingerprint = JSON.stringify({
    form: {
      id: compact(form.id, 180),
      name: compact(form.getAttribute?.('name'), 180),
      action: compact(form.action, 1200),
      method: compact(form.method || 'get', 20).toUpperCase(),
      target: compact(form.target, 180),
      baseTarget,
      enctype: compact(form.enctype, 180),
      noValidate: Boolean(form.noValidate)
    },
    submitter: submitter
      ? {
          tag: compact(submitter.tagName, 40).toLowerCase(),
          type: compact(
            submitter.type ||
            submitter.getAttribute?.('type') ||
            'submit',
            40
          ).toLowerCase(),
          id: compact(submitter.id, 180),
          name: compact(submitter.getAttribute?.('name'), 180),
          value: compact(submitter.value, 1200),
          accessibleName: compact(elementAccessibleName(submitter), 300),
          action: submitterOverrides.action
            ? compact(submitter.formAction, 1200)
            : '',
          method: submitterOverrides.method
            ? compact(submitter.formMethod, 20).toUpperCase()
            : '',
          target: submitterOverrides.target
            ? compact(submitter.formTarget, 180)
            : '',
          enctype: submitterOverrides.enctype
            ? compact(submitter.formEnctype, 180)
            : '',
          noValidate: Boolean(submitter.formNoValidate),
          markup: compact(submitter.outerHTML, 4000)
        }
      : null
  });
  return {
    form,
    submitter,
    action: effectiveAction,
    method: effectiveMethod,
    target: effectiveTarget,
    requestShape,
    fingerprint
  };
}

function isDeepActiveElement(element) {
  let active = element.ownerDocument.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active === element;
}

function snapshotPage(args) {
  ensurePageObserver();
  const maxElements = Math.max(1, Math.min(250, Number(args.maxElements) || 140));
  const maxText = Math.max(500, Math.min(20000, Number(args.maxText) || 10000));
  const tokenPrefix = String(args.tokenPrefix || 'browsme');
  let sequence = 0;
  const elements = [];
  const textParts = [];
  const headings = [];
  const dialogs = [];
  const opaqueFrames = [];
  globalThis.__browsmeElementRefs = new Map();
  globalThis.__browsmeElementActionProxies = new Map();
  globalThis.__browsmeFormSubmitters = new Map();

  function normalize(value, limit = 180) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  function getName(element) {
    return elementAccessibleName(element);
  }

  function getGroupName(element) {
    const group = element.closest?.(
      '[role="radiogroup"],[role="group"],fieldset'
    );
    if (!group) {
      return '';
    }
    if (String(group.tagName || '').toLowerCase() === 'fieldset') {
      const legend = Array.from(group.children || []).find(
        (child) => String(child.tagName || '').toLowerCase() === 'legend'
      );
      return normalize(legend?.innerText || legend?.textContent, 180);
    }
    return normalize(elementAccessibleName(group), 180);
  }

  function getDescription(element) {
    const describedBy = String(element.getAttribute?.('aria-describedby') || '')
      .trim();
    if (!describedBy) {
      return '';
    }
    const root = element.getRootNode?.();
    return normalize(
      describedBy
        .split(/\s+/)
        .map((id) => (
          root?.getElementById?.(id) ||
          element.ownerDocument.getElementById(id)
        ))
        .filter(Boolean)
        .map((node) => node.innerText || node.textContent)
        .join(' '),
      300
    );
  }

  function isVisible(element, frameOffset) {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      return false;
    }

    const style = view.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return false;
    }

    const left = rect.left + frameOffset.x;
    const top = rect.top + frameOffset.y;
    return left < window.innerWidth && top < window.innerHeight && left + rect.width > 0 && top + rect.height > 0;
  }

  function addElement(element, frameOffset, frameLabel) {
    const tag = element.tagName.toLowerCase();
    const type = normalize(element.type || element.getAttribute('type'), 40).toLowerCase();
    let actionProxy = null;
    if (
      !isVisible(element, frameOffset) &&
      tag === 'input' &&
      ['checkbox', 'radio'].includes(type)
    ) {
      actionProxy = Array.from(element.labels || [])
        .find((label) => isVisible(label, frameOffset)) || null;
    }
    const visibleElement = actionProxy || element;
    if (
      elements.length >= maxElements ||
      !isVisible(visibleElement, frameOffset)
    ) {
      return;
    }

    const rect = visibleElement.getBoundingClientRect();
    const token = `${tokenPrefix}-${++sequence}`;
    globalThis.__browsmeElementRefs.set(token, element);
    if (actionProxy) {
      globalThis.__browsmeElementActionProxies.set(token, actionProxy);
    }
    const role = elementRole(element);
    const name = getName(element);
    const href = tag === 'a' ? normalize(element.href, 500) : '';
    const inputLike = tag === 'input' || tag === 'textarea' || element.isContentEditable;
    const submission = effectiveFormSubmission(element);
    const form = submission.form;
    globalThis.__browsmeFormSubmitters.set(
      token,
      submission.submitter || null
    );
    const selectOptions = tag === 'select'
      ? Array.from(element.options || [])
      : [];
    const optionDetails = tag === 'select'
      ? selectOptions
        .slice(0, 60)
        .map((option) => ({
          label: normalize(option.textContent || option.label || option.value, 120),
          value: normalize(option.value, 500),
          selected: Boolean(option.selected),
          disabled: Boolean(
            option.disabled ||
            (
              String(option.parentElement?.tagName || '').toLowerCase() === 'optgroup' &&
              option.parentElement.disabled
            )
          ),
          group: String(option.parentElement?.tagName || '').toLowerCase() === 'optgroup'
            ? normalize(option.parentElement.label, 120)
            : undefined
        }))
      : undefined;
    const options = optionDetails
      ? optionDetails.map((option) => option.label).filter(Boolean)
      : undefined;
    const selectedOptions = tag === 'select'
      ? selectOptions.filter((option) => option.selected)
      : [];
    const selectedOption = tag === 'select'
      ? element.options?.[element.selectedIndex]
      : null;

    elements.push({
      token,
      tag,
      type,
      role,
      name: name || `${tag}${type ? ` (${type})` : ''}`,
      description: getDescription(element) || undefined,
      groupName: getGroupName(element) || undefined,
      fieldName: normalize(element.getAttribute?.('name'), 180) || undefined,
      choiceValue:
        tag === 'input' && ['checkbox', 'radio'].includes(type)
          ? normalize(element.value, 500)
          : undefined,
      href,
      disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
      checked: elementCheckedState(element),
      mixed: elementMixedState(element) || undefined,
      selected: elementSelectedState(element),
      multiple:
        tag === 'select' ||
        (tag === 'input' && type === 'file') ||
        element.hasAttribute('aria-multiselectable')
          ? Boolean(
              element.multiple ||
              element.getAttribute('aria-multiselectable') === 'true'
            )
          : undefined,
      selectedIndex: tag === 'select' ? element.selectedIndex : undefined,
      selectedLabel: selectedOption
        ? normalize(selectedOption.textContent || selectedOption.label, 180)
        : undefined,
      selectedLabels: tag === 'select'
        ? selectedOptions.map(
          (option) => normalize(option.textContent || option.label || option.value, 180)
        )
        : undefined,
      selectedValues: tag === 'select'
        ? selectedOptions.map((option) => normalize(option.value, 500))
        : undefined,
      valueSet: inputLike ? Boolean(element.value || normalize(element.innerText)) : undefined,
      password: tag === 'input' && type === 'password',
      required: Boolean(element.required || element.getAttribute('aria-required') === 'true') || undefined,
      readOnly: Boolean(element.readOnly) || undefined,
      accept: tag === 'input' && type === 'file'
        ? normalize(element.accept, 500) || undefined
        : undefined,
      min: tag === 'input' ? normalize(element.min, 120) || undefined : undefined,
      max: tag === 'input' ? normalize(element.max, 120) || undefined : undefined,
      step: tag === 'input' ? normalize(element.step, 120) || undefined : undefined,
      pattern: tag === 'input' ? normalize(element.pattern, 500) || undefined : undefined,
      maxLength: Number(element.maxLength) >= 0
        ? Number(element.maxLength)
        : undefined,
      expanded: element.hasAttribute('aria-expanded')
        ? element.getAttribute('aria-expanded') === 'true'
        : undefined,
      pressed: element.hasAttribute('aria-pressed')
        ? element.getAttribute('aria-pressed') === 'true'
        : undefined,
      ariaValueNow: normalize(element.getAttribute('aria-valuenow'), 120) || undefined,
      ariaValueText: normalize(element.getAttribute('aria-valuetext'), 180) || undefined,
      ariaValueMin: normalize(element.getAttribute('aria-valuemin'), 120) || undefined,
      ariaValueMax: normalize(element.getAttribute('aria-valuemax'), 120) || undefined,
      autocomplete: normalize(element.getAttribute('autocomplete'), 80) || undefined,
      formAction: form ? normalize(submission.action, 1000) : undefined,
      formMethod: form ? normalize(submission.method, 20).toUpperCase() : undefined,
      navigationTarget: tag === 'a'
        ? normalize(
            element.target ||
            element.ownerDocument.querySelector?.('base[target]')?.target,
            180
          )
        : (form ? normalize(submission.target, 180) : undefined),
      formSubmissionFingerprint: submission.fingerprint,
      options,
      optionDetails,
      frame: frameLabel || 'top',
      bounds: {
        x: Math.round(rect.left + frameOffset.x),
        y: Math.round(rect.top + frameOffset.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    });
  }

  function walkShadowRoot(root, frameOffset, frameLabel, selector) {
    try {
      const shadowText = normalize(root.textContent, 2000);
      if (shadowText) {
        textParts.push(shadowText);
      }
      for (const element of Array.from(root.querySelectorAll(selector))) {
        addElement(element, frameOffset, frameLabel);
        if (elements.length >= maxElements) {
          return;
        }
      }
      for (const host of Array.from(root.querySelectorAll('*'))) {
        if (!host.shadowRoot || elements.length >= maxElements) {
          continue;
        }
        walkShadowRoot(
          host.shadowRoot,
          frameOffset,
          `${frameLabel} > shadow`,
          selector
        );
      }
    } catch {
      // A closed or changing shadow tree remains opaque.
    }
  }

  function walkDocument(doc, frameOffset, frameLabel) {
    try {
      if (doc.body) {
        textParts.push(normalize(doc.body.innerText, maxText));
      }

      const headingCandidates = Array.from(
        doc.querySelectorAll('h1,h2,h3,[role="heading"]')
      ).slice(0, 50);
      for (const heading of headingCandidates) {
        const name = getName(heading);
        if (name && !headings.includes(name)) {
          headings.push(name);
        }
      }

      const dialogCandidates = Array.from(
        doc.querySelectorAll('dialog,[role="dialog"],[role="alertdialog"]')
      ).slice(0, 20);
      for (const dialog of dialogCandidates) {
        if (!isVisible(dialog, frameOffset)) {
          continue;
        }
        dialogs.push({
          name: getName(dialog) || 'Dialog',
          modal: dialog.matches('dialog[open]') ||
            dialog.getAttribute('aria-modal') === 'true'
        });
      }

      const selector = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'textarea',
        'select',
        'summary',
        '[contenteditable]:not([contenteditable="false"])',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="checkbox"]',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="radio"]',
        '[role="menuitem"]',
        '[role="menuitemcheckbox"]',
        '[role="menuitemradio"]',
        '[role="option"]',
        '[role="searchbox"]',
        '[role="slider"]',
        '[role="spinbutton"]',
        '[role="switch"]',
        '[role="treeitem"]',
        '[aria-haspopup]',
        '[onclick]',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',');

      const candidates = Array.from(doc.querySelectorAll(selector));
      for (const element of candidates) {
        addElement(element, frameOffset, frameLabel);
        if (elements.length >= maxElements) {
          break;
        }
      }

      const allElements = Array.from(doc.querySelectorAll('*'));
      for (const host of allElements) {
        if (!host.shadowRoot || elements.length >= maxElements) {
          continue;
        }
        walkShadowRoot(
          host.shadowRoot,
          frameOffset,
          `${frameLabel || 'top'} > shadow`,
          selector
        );
      }

      const frames = Array.from(doc.querySelectorAll('iframe,frame'));
      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        try {
          if (!frame.contentDocument) {
            const rect = frame.getBoundingClientRect();
            opaqueFrames.push({
              title: normalize(frame.title, 180) || `Frame ${index + 1}`,
              src: normalize(frame.src, 500),
              bounds: {
                x: Math.round(frameOffset.x + rect.left),
                y: Math.round(frameOffset.y + rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            });
            continue;
          }
          const rect = frame.getBoundingClientRect();
          walkDocument(
            frame.contentDocument,
            { x: frameOffset.x + rect.left, y: frameOffset.y + rect.top },
            `${frameLabel || 'top'} > frame ${index + 1}`
          );
        } catch {
          const rect = frame.getBoundingClientRect();
          opaqueFrames.push({
            title: normalize(frame.title, 180) || `Frame ${index + 1}`,
            src: normalize(frame.src, 500),
            bounds: {
              x: Math.round(frameOffset.x + rect.left),
              y: Math.round(frameOffset.y + rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          });
        }
      }
    } catch {
      // A changing or hostile document should produce a partial snapshot, not fail the run.
    }
  }

  walkDocument(document, { x: 0, y: 0 }, 'top');
  const text = textParts.filter(Boolean).join('\n').slice(0, maxText);
  const lowerText = text.toLowerCase();
  const securitySignals = [];
  if (
    lowerText.includes('ignore previous instructions') ||
    lowerText.includes('ignore all previous instructions') ||
    lowerText.includes('disregard previous instructions')
  ) {
    securitySignals.push('possible-prompt-injection');
  }
  if (
    lowerText.includes('system prompt') ||
    lowerText.includes('developer message') ||
    lowerText.includes('reveal your instructions')
  ) {
    securitySignals.push('instruction-exfiltration-language');
  }

  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    text,
    headings: headings.slice(0, 50),
    dialogs,
    opaqueFrames,
    securitySignals,
    viewport: {
      width: Math.round(window.innerWidth),
      height: Math.round(window.innerHeight),
      scrollX: Math.round(window.scrollX),
      scrollY: Math.round(window.scrollY),
      maxScrollX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    },
    mutationRevision: Number(globalThis.__browsmeMutationRevision) || 0,
    elements
  };
}

function findReferencedElement(token) {
  const element = globalThis.__browsmeElementRefs?.get(token);
  if (!element || !element.isConnected) {
    return null;
  }
  const storedProxy = globalThis.__browsmeElementActionProxies?.get(token);
  const actionElement = storedProxy?.isConnected ? storedProxy : element;

  const frameChain = [];
  let currentWindow = element.ownerDocument.defaultView;
  while (currentWindow && currentWindow !== window) {
    try {
      const frame = currentWindow.frameElement;
      if (!frame) {
        return null;
      }
      frameChain.push({ frame, childWindow: currentWindow });
      currentWindow = frame.ownerDocument.defaultView;
    } catch {
      return null;
    }
  }
  if (currentWindow !== window) {
    return null;
  }

  const transformPoint = (x, y) => {
    let pointX = Number(x) || 0;
    let pointY = Number(y) || 0;
    for (const { frame, childWindow } of frameChain) {
      const rect = frame.getBoundingClientRect();
      const scaleX = rect.width / Math.max(1, Number(frame.offsetWidth) || rect.width);
      const scaleY = rect.height / Math.max(1, Number(frame.offsetHeight) || rect.height);
      const viewportScaleX =
        (Math.max(1, Number(frame.clientWidth) || rect.width) * scaleX) /
        Math.max(1, Number(childWindow.innerWidth) || frame.clientWidth || rect.width);
      const viewportScaleY =
        (Math.max(1, Number(frame.clientHeight) || rect.height) * scaleY) /
        Math.max(1, Number(childWindow.innerHeight) || frame.clientHeight || rect.height);
      pointX = rect.left + (Number(frame.clientLeft) || 0) * scaleX + pointX * viewportScaleX;
      pointY = rect.top + (Number(frame.clientTop) || 0) * scaleY + pointY * viewportScaleY;
    }
    return { x: pointX, y: pointY };
  };
  const origin = transformPoint(0, 0);
  return {
    element,
    actionElement,
    frameChain,
    transformPoint,
    offset: origin
  };
}

async function prepareReferencedElement(args) {
  const afterFrames = () => new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(finish, 160);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
  const composedContains = (container, candidate) => {
    let current = candidate;
    while (current) {
      if (current === container) {
        return true;
      }
      const currentRoot = current.getRootNode?.();
      current = current.parentNode || currentRoot?.host || null;
    }
    return false;
  };
  const composedParent = (node) => {
    const root = node?.getRootNode?.();
    return node?.parentElement || root?.host || null;
  };
  const hasSeparateInteractiveDescendant = (candidate, container) => {
    const interactiveRoles = new Set([
      'button',
      'checkbox',
      'combobox',
      'link',
      'listbox',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'option',
      'radio',
      'searchbox',
      'slider',
      'spinbutton',
      'switch',
      'tab',
      'textbox',
      'treeitem'
    ]);
    let current = candidate;
    while (current?.nodeType === Node.ELEMENT_NODE && current !== container) {
      const tag = String(current.tagName || '').toLowerCase();
      const role = String(current.getAttribute?.('role') || '')
        .trim()
        .toLowerCase()
        .split(/\s+/)[0];
      const nativeInteractive =
        current.matches?.(
          'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,iframe,frame,object,embed,[contenteditable]:not([contenteditable="false"])'
        ) ||
        (tag === 'label' && Boolean(current.control));
      const explicitHandler = [
        'onclick',
        'onauxclick',
        'onpointerdown',
        'onpointerup',
        'onmousedown',
        'onmouseup'
      ].some((name) => (
        current.hasAttribute?.(name) ||
        typeof current[name] === 'function'
      ));
      if (
        nativeInteractive ||
        interactiveRoles.has(role) ||
        current.isContentEditable ||
        Number(current.tabIndex) >= 0 ||
        current.hasAttribute?.('formaction') ||
        explicitHandler
      ) {
        return true;
      }
      current = composedParent(current);
    }
    return false;
  };
  const deepestComposedHit = (root, x, y, ownerDocument) => {
    const firstHit = (targetRoot) => {
      const hits = typeof targetRoot?.elementsFromPoint === 'function'
        ? targetRoot.elementsFromPoint(x, y)
        : ownerDocument.elementsFromPoint(x, y);
      return hits.find(
        (candidate) => candidate !== ownerDocument.documentElement
      ) || null;
    };
    let hit = firstHit(root);
    const visited = new Set();
    while (
      hit?.shadowRoot?.mode === 'open' &&
      !visited.has(hit)
    ) {
      visited.add(hit);
      const nestedHit = firstHit(hit.shadowRoot);
      if (!nestedHit || nestedHit === hit) {
        break;
      }
      hit = nestedHit;
    }
    return hit;
  };
  const composedStateError = (node) => {
    let current = node;
    while (current?.nodeType === Node.ELEMENT_NODE) {
      const view = current.ownerDocument?.defaultView;
      const currentStyle = view?.getComputedStyle(current);
      if (
        !currentStyle ||
        currentStyle.display === 'none' ||
        currentStyle.visibility === 'hidden' ||
        currentStyle.visibility === 'collapse' ||
        currentStyle.contentVisibility === 'hidden' ||
        Number(currentStyle.opacity) === 0
      ) {
        return 'ELEMENT_NOT_VISIBLE';
      }
      if (
        currentStyle.pointerEvents === 'none' ||
        current.inert ||
        current.hasAttribute?.('inert')
      ) {
        return 'ELEMENT_NOT_INTERACTIVE';
      }
      current = composedParent(current);
    }
    return '';
  };
  const hasUnsupportedFrameTransform = (frame) => {
    let current = frame;
    while (current?.nodeType === Node.ELEMENT_NODE) {
      const transform = current.ownerDocument.defaultView
        .getComputedStyle(current)
        .transform;
      if (transform && transform !== 'none') {
        try {
          const matrix = new DOMMatrix(transform);
          if (
            !matrix.is2D ||
            matrix.a <= 0 ||
            matrix.d <= 0 ||
            Math.abs(matrix.b) > 0.001 ||
            Math.abs(matrix.c) > 0.001
          ) {
            return true;
          }
        } catch {
          return true;
        }
      }
      current = composedParent(current);
    }
    return false;
  };
  const targetPoints = (node) => {
    const view = node.ownerDocument?.defaultView;
    const viewportWidth = Math.max(1, Number(view?.innerWidth) || 1);
    const viewportHeight = Math.max(1, Number(view?.innerHeight) || 1);
    const clientRects = Array.from(node.getClientRects?.() || [])
      .map((candidate) => {
        const left = Math.max(0, candidate.left);
        const top = Math.max(0, candidate.top);
        const right = Math.min(viewportWidth, candidate.right);
        const bottom = Math.min(viewportHeight, candidate.bottom);
        return {
          left,
          top,
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top)
        };
      })
      .filter((candidate) => candidate.width >= 2 && candidate.height >= 2)
      .sort((left, right) => (
        (right.width * right.height) - (left.width * left.height)
      ));
    const points = [];
    for (const candidate of clientRects) {
      for (const [horizontal, vertical] of [
        [0.5, 0.5],
        [0.25, 0.5],
        [0.75, 0.5],
        [0.5, 0.25],
        [0.5, 0.75]
      ]) {
        points.push({
          x: candidate.left + candidate.width * horizontal,
          y: candidate.top + candidate.height * vertical
        });
      }
    }
    return points;
  };

  let result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }

  let element = result.element;
  let actionElement = result.actionElement || element;
  const preflightOnly = args.scroll === false;
  if (!preflightOnly) {
    actionElement.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    await afterFrames();
    result = findReferencedElement(String(args.token || ''));
    if (!result) {
      return { ok: false, error: 'STALE_SNAPSHOT' };
    }
    element = result.element;
    actionElement = result.actionElement || element;
  }

  const firstRect = actionElement.getBoundingClientRect();
  const firstLocalPoint = targetPoints(actionElement)[0] || {
    x: firstRect.left + firstRect.width / 2,
    y: firstRect.top + firstRect.height / 2
  };
  const firstPoint = result.transformPoint(
    firstLocalPoint.x,
    firstLocalPoint.y
  );
  if (!preflightOnly) {
    await afterFrames();
    result = findReferencedElement(String(args.token || ''));
    if (!result) {
      return { ok: false, error: 'STALE_SNAPSHOT' };
    }
    element = result.element;
    actionElement = result.actionElement || element;
  }
  const rect = actionElement.getBoundingClientRect();
  const primaryLocalPoint = targetPoints(actionElement)[0] || {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
  const primaryPoint = result.transformPoint(
    primaryLocalPoint.x,
    primaryLocalPoint.y
  );
  if (
    !preflightOnly &&
    (
      Math.abs(firstRect.left - rect.left) > 2 ||
      Math.abs(firstRect.top - rect.top) > 2 ||
      Math.abs(firstRect.width - rect.width) > 2 ||
      Math.abs(firstRect.height - rect.height) > 2 ||
      Math.abs(firstPoint.x - primaryPoint.x) > 2 ||
      Math.abs(firstPoint.y - primaryPoint.y) > 2
    )
  ) {
    return { ok: false, error: 'ELEMENT_MOVING' };
  }
  const style = actionElement.ownerDocument.defaultView.getComputedStyle(actionElement);
  const composedError = composedStateError(actionElement);
  if (composedError) {
    return { ok: false, error: composedError };
  }
  const visible =
    rect.width >= 2 &&
    rect.height >= 2 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) !== 0;

  if (!visible) {
    return { ok: false, error: 'ELEMENT_NOT_VISIBLE' };
  }
  if (
    style.pointerEvents === 'none' ||
    actionElement.inert ||
    actionElement.closest?.('[inert]') ||
    element.inert ||
    element.closest?.('[inert]') ||
    element.disabled ||
    element.getAttribute('aria-disabled') === 'true'
  ) {
    return { ok: false, error: 'ELEMENT_NOT_INTERACTIVE' };
  }
  if (
    ['iframe', 'frame', 'object', 'embed']
      .includes(String(element.tagName || '').toLowerCase())
  ) {
    return { ok: false, error: 'ELEMENT_NOT_INTERACTIVE' };
  }
  if (
    String(element.tagName || '').toLowerCase() === 'label' &&
    element.control
  ) {
    return { ok: false, error: 'ELEMENT_NOT_INTERACTIVE' };
  }

  const root = actionElement.getRootNode();
  let localX = primaryLocalPoint.x;
  let localY = primaryLocalPoint.y;
  let hitTarget = null;
  let coveringTarget = null;
  const outsideTopViewport =
    primaryPoint.x < 0 ||
    primaryPoint.y < 0 ||
    primaryPoint.x >= globalThis.innerWidth ||
    primaryPoint.y >= globalThis.innerHeight;
  const candidatePoints = targetPoints(actionElement);
  if (candidatePoints.length === 0) {
    candidatePoints.push(primaryLocalPoint);
  }
  if (preflightOnly && outsideTopViewport) {
    hitTarget = actionElement;
  } else {
    for (const candidatePoint of candidatePoints) {
      const candidateHit = deepestComposedHit(
        root,
        candidatePoint.x,
        candidatePoint.y,
        actionElement.ownerDocument
      );
      coveringTarget ||= candidateHit;
      if (
        candidateHit &&
        (
          candidateHit === actionElement ||
          (actionElement !== element && candidateHit === element) ||
          (
            composedContains(actionElement, candidateHit) &&
            !hasSeparateInteractiveDescendant(candidateHit, actionElement)
          )
        )
      ) {
        localX = candidatePoint.x;
        localY = candidatePoint.y;
        hitTarget = candidateHit;
        break;
      }
    }
  }
  if (!hitTarget) {
    return {
      ok: false,
      error: 'ELEMENT_OCCLUDED',
      coveringTag: String(coveringTarget?.tagName || '').toLowerCase()
    };
  }
  const point = result.transformPoint(localX, localY);

  let framePointX = localX;
  let framePointY = localY;
  for (const { frame, childWindow } of (
    preflightOnly && outsideTopViewport ? [] : result.frameChain
  )) {
    const frameRect = frame.getBoundingClientRect();
    const frameStyle = frame.ownerDocument.defaultView.getComputedStyle(frame);
    const frameComposedError = composedStateError(frame);
    if (frameComposedError) {
      return { ok: false, error: frameComposedError };
    }
    if (hasUnsupportedFrameTransform(frame)) {
      return { ok: false, error: 'ELEMENT_UNSUPPORTED_GEOMETRY' };
    }
    if (
      frameRect.width < 2 ||
      frameRect.height < 2 ||
      frameStyle.display === 'none' ||
      frameStyle.visibility === 'hidden' ||
      Number(frameStyle.opacity) === 0
    ) {
      return { ok: false, error: 'ELEMENT_NOT_VISIBLE' };
    }
    if (
      frameStyle.pointerEvents === 'none' ||
      frame.inert ||
      frame.closest?.('[inert]')
    ) {
      return { ok: false, error: 'ELEMENT_NOT_INTERACTIVE' };
    }
    const scaleX = frameRect.width / Math.max(1, Number(frame.offsetWidth) || frameRect.width);
    const scaleY = frameRect.height / Math.max(1, Number(frame.offsetHeight) || frameRect.height);
    const viewportScaleX =
      (Math.max(1, Number(frame.clientWidth) || frameRect.width) * scaleX) /
      Math.max(1, Number(childWindow.innerWidth) || frame.clientWidth || frameRect.width);
    const viewportScaleY =
      (Math.max(1, Number(frame.clientHeight) || frameRect.height) * scaleY) /
      Math.max(1, Number(childWindow.innerHeight) || frame.clientHeight || frameRect.height);
    framePointX =
      frameRect.left +
      (Number(frame.clientLeft) || 0) * scaleX +
      framePointX * viewportScaleX;
    framePointY =
      frameRect.top +
      (Number(frame.clientTop) || 0) * scaleY +
      framePointY * viewportScaleY;
    const parentRoot = frame.getRootNode();
    const parentHits = typeof parentRoot.elementsFromPoint === 'function'
      ? parentRoot.elementsFromPoint(framePointX, framePointY)
      : frame.ownerDocument.elementsFromPoint(framePointX, framePointY);
    const parentHit = parentHits.find(
      (candidate) => candidate !== frame.ownerDocument.documentElement
    );
    if (
      !parentHit ||
      (parentHit !== frame && !composedContains(frame, parentHit))
    ) {
      return {
        ok: false,
        error: 'ELEMENT_OCCLUDED',
        coveringTag: String(parentHit?.tagName || '').toLowerCase()
      };
    }
  }

  const submission = effectiveFormSubmission(element);
  const form = submission.form;
  const expectedSubmitters = globalThis.__browsmeFormSubmitters;
  const formSubmitterSame =
    !expectedSubmitters?.has(String(args.token || '')) ||
    expectedSubmitters.get(String(args.token || '')) === submission.submitter;
  const tag = element.tagName.toLowerCase();
  const type = String(element.type || element.getAttribute('type') || '').toLowerCase();
  const name = elementAccessibleName(element) || `${tag}${type ? ` (${type})` : ''}`;

  return {
    ok: true,
    x: Math.round(point.x),
    y: Math.round(point.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    tag,
    type,
    role: elementRole(element),
    name,
    href: element.tagName === 'A' ? String(element.href || '').slice(0, 1000) : '',
    formAction: form ? String(submission.action).slice(0, 1000) : '',
    formMethod: form ? String(submission.method).toUpperCase() : '',
    navigationTarget: element.tagName === 'A'
      ? String(
          element.target ||
          element.ownerDocument.querySelector?.('base[target]')?.target ||
          ''
        ).slice(0, 180)
      : (form ? String(submission.target || '').slice(0, 180) : ''),
    formRequestShape: form ? submission.requestShape : null,
    formSubmissionFingerprint: submission.fingerprint,
    formSubmitterSame,
    disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
    readOnly: Boolean(element.readOnly),
    checked: elementCheckedState(element),
    mixed: elementMixedState(element),
    selected: elementSelectedState(element),
    multiple: Boolean(
      element.multiple ||
      element.getAttribute('aria-multiselectable') === 'true'
    )
  };
}

function focusReferencedElement(args) {
  const result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }

  const { element } = result;
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  element.focus();

  if (args.clear === true) {
    if (typeof element.select === 'function') {
      element.select();
    } else if (element.isContentEditable) {
      const selection = element.ownerDocument.getSelection();
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  const rect = element.getBoundingClientRect();
  const point = result.transformPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
  return {
    ok: true,
    x: Math.round(point.x),
    y: Math.round(point.y),
    tag: element.tagName.toLowerCase(),
    type: String(element.type || element.getAttribute('type') || '').toLowerCase(),
    password: element.tagName === 'INPUT' && String(element.type).toLowerCase() === 'password',
    editable: elementIsEditable(element),
    focused: isDeepActiveElement(element)
  };
}

function inspectReferencedElement(args) {
  ensurePageObserver();
  const result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }

  const element = result.element;
  const inputLike =
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable;
  const currentValue = inputLike
    ? String(element.isContentEditable ? element.innerText : element.value)
    : '';
  const valueLength = inputLike
    ? currentValue.length
    : undefined;
  const valueMatched =
    inputLike && typeof args.expectedValue === 'string'
      ? currentValue === args.expectedValue
      : undefined;
  const submission = effectiveFormSubmission(element);
  const form = submission.form;
  const expectedSubmitters = globalThis.__browsmeFormSubmitters;
  const formSubmitterSame =
    !expectedSubmitters?.has(String(args.token || '')) ||
    expectedSubmitters.get(String(args.token || '')) === submission.submitter;
  const tag = String(element.tagName || '').toLowerCase();
  const type = String(element.type || element.getAttribute('type') || '').toLowerCase();
  const selectedOptions = tag === 'select'
    ? Array.from(element.options || []).filter((option) => option.selected)
    : [];
  const structuredInput = tag === 'input' && [
    'color',
    'date',
    'datetime-local',
    'month',
    'number',
    'range',
    'time',
    'week'
  ].includes(type);
  return {
    ok: true,
    connected: element.isConnected,
    focused: isDeepActiveElement(element),
    disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
    readOnly: Boolean(element.readOnly),
    editable: elementIsEditable(element),
    checked: elementCheckedState(element),
    mixed: elementMixedState(element),
    selected: elementSelectedState(element),
    multiple: Boolean(
      element.multiple ||
      element.getAttribute('aria-multiselectable') === 'true'
    ),
    selectedIndex: element.tagName === 'SELECT' ? element.selectedIndex : undefined,
    selectedLabel: element.tagName === 'SELECT'
      ? String(
        element.options?.[element.selectedIndex]?.textContent ||
        element.options?.[element.selectedIndex]?.label ||
        ''
      ).replace(/\s+/g, ' ').trim().slice(0, 180)
      : undefined,
    selectedValue: element.tagName === 'SELECT'
      ? String(element.options?.[element.selectedIndex]?.value || '').slice(0, 500)
      : undefined,
    selectedIndices: element.tagName === 'SELECT'
      ? selectedOptions.map((option) => option.index)
      : undefined,
    selectedLabels: element.tagName === 'SELECT'
      ? selectedOptions.map((option) => String(
        option.textContent || option.label || option.value || ''
      ).replace(/\s+/g, ' ').trim().slice(0, 180))
      : undefined,
    selectedValues: element.tagName === 'SELECT'
      ? selectedOptions.map((option) => String(option.value || '').slice(0, 500))
      : undefined,
    structuredValue: structuredInput
      ? String(element.value || '').slice(0, 500)
      : undefined,
    valueLength,
    valueSet: inputLike ? valueLength > 0 : undefined,
    valueMatched,
    tag,
    type,
    role: elementRole(element),
    name: elementAccessibleName(element) || `${tag}${type ? ` (${type})` : ''}`,
    href: element.tagName === 'A' ? String(element.href || '').slice(0, 1000) : '',
    formAction: form ? String(submission.action).slice(0, 1000) : '',
    formMethod: form ? String(submission.method).toUpperCase() : '',
    navigationTarget: element.tagName === 'A'
      ? String(
          element.target ||
          element.ownerDocument.querySelector?.('base[target]')?.target ||
          ''
        ).slice(0, 180)
      : (form ? String(submission.target || '').slice(0, 180) : ''),
    formRequestShape: form ? submission.requestShape : null,
    formSubmissionFingerprint: submission.fingerprint,
    formSubmitterSame,
    mutationRevision: Number(globalThis.__browsmeMutationRevision) || 0
  };
}

function inspectPageState() {
  ensurePageObserver();
  const active = document.activeElement;
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    loading: document.readyState === 'loading',
    mutationRevision: Number(globalThis.__browsmeMutationRevision) || 0,
    lastMutationAt: Number(globalThis.__browsmeLastMutationAt) || 0,
    textLength: String(document.body?.innerText || '').length,
    activeElement: active
      ? {
          tag: String(active.tagName || '').toLowerCase(),
          type: String(active.getAttribute?.('type') || '').toLowerCase(),
          name: String(
            active.getAttribute?.('aria-label') ||
            active.getAttribute?.('name') ||
            active.id ||
            ''
          ).replace(/\s+/g, ' ').trim().slice(0, 120)
        }
      : null,
    scrollX: Math.round(window.scrollX),
    scrollY: Math.round(window.scrollY)
  };
}

function matchPageCondition(args) {
  ensurePageObserver();
  const condition = String(args.condition || '');
  const requested = String(args.value || '').trim().toLowerCase();
  const pageText = String(document.body?.innerText || '').toLowerCase();
  let matched = false;

  if (condition === 'loading_done') {
    matched = document.readyState !== 'loading';
  } else if (condition === 'dom_stable') {
    const lastMutationAt = Number(globalThis.__browsmeLastMutationAt) || 0;
    const observerInstalledAt = Number(globalThis.__browsmeObserverInstalledAt) || Date.now();
    matched =
      document.readyState !== 'loading' &&
      Date.now() - Math.max(lastMutationAt, observerInstalledAt) >= 500;
  } else if (condition === 'text') {
    matched = Boolean(requested) && pageText.includes(requested);
  } else if (condition === 'text_gone') {
    matched = Boolean(requested) && !pageText.includes(requested);
  } else if (condition === 'url_contains') {
    matched = Boolean(requested) && location.href.toLowerCase().includes(requested);
  } else if (condition === 'title_contains') {
    matched = Boolean(requested) && document.title.toLowerCase().includes(requested);
  } else if (condition === 'element') {
    const selector = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      '[contenteditable]:not([contenteditable="false"])',
      '[role="button"]',
      '[role="checkbox"]',
      '[role="combobox"]',
      '[role="link"]',
      '[role="listbox"]',
      '[role="option"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="dialog"]',
      '[role="alert"]'
    ].join(',');
    matched = Boolean(requested) && Array.from(document.querySelectorAll(selector))
      .some((element) => {
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visible =
          rect.width >= 2 &&
          rect.height >= 2 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0;
        return visible && elementAccessibleName(element).toLowerCase().includes(requested);
      });
  }

  return {
    ok: true,
    matched,
    condition,
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    mutationRevision: Number(globalThis.__browsmeMutationRevision) || 0
  };
}

function resolveReferencedOption(args) {
  const result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }

  const element = result.element;
  if (element.tagName !== 'SELECT') {
    return { ok: false, error: 'ELEMENT_NOT_SELECT' };
  }
  const values = Array.isArray(args.values)
    ? args.values.map((value) => String(value))
    : [String(args.value ?? '')];
  if (!values.length) {
    return { ok: false, error: 'OPTION_REQUIRED' };
  }
  const mode = ['replace', 'add', 'remove'].includes(String(args.mode || ''))
    ? String(args.mode)
    : 'replace';
  if (!element.multiple && (values.length !== 1 || mode !== 'replace')) {
    return { ok: false, error: 'MULTIPLE_VALUES_REQUIRE_MULTI_SELECT' };
  }

  const options = Array.from(element.options || []);
  const requestedOptions = [];
  for (const value of values) {
    const requested = value.trim().toLowerCase();
    const valueMatches = options.filter(
      (entry) => String(entry.value).trim().toLowerCase() === requested
    );
    const labelMatches = options.filter(
      (entry) => String(entry.textContent || entry.label || '')
        .trim()
        .toLowerCase() === requested
    );
    const matches = valueMatches.length ? valueMatches : labelMatches;

    if (!matches.length) {
      return { ok: false, error: 'OPTION_NOT_FOUND', requested: value.slice(0, 180) };
    }
    if (matches.length > 1) {
      return { ok: false, error: 'OPTION_AMBIGUOUS', requested: value.slice(0, 180) };
    }
    const option = matches[0];
    const disabledByGroup =
      String(option.parentElement?.tagName || '').toLowerCase() === 'optgroup' &&
      option.parentElement.disabled;
    if (option.disabled || disabledByGroup) {
      return { ok: false, error: 'OPTION_DISABLED', requested: value.slice(0, 180) };
    }
    if (!requestedOptions.includes(option)) {
      requestedOptions.push(option);
    }
  }

  const currentIndices = options
    .filter((option) => option.selected)
    .map((option) => option.index);
  let targetIndices;
  if (!element.multiple || mode === 'replace') {
    targetIndices = requestedOptions.map((option) => option.index);
  } else if (mode === 'add') {
    targetIndices = Array.from(new Set([
      ...currentIndices,
      ...requestedOptions.map((option) => option.index)
    ]));
  } else {
    const removed = new Set(requestedOptions.map((option) => option.index));
    targetIndices = currentIndices.filter((index) => !removed.has(index));
  }
  targetIndices.sort((left, right) => left - right);
  const selectedOptions = targetIndices
    .map((index) => options[index])
    .filter(Boolean);
  const selectedLabels = selectedOptions.map((option) => String(
    option.textContent || option.label || option.value || ''
  ).replace(/\s+/g, ' ').trim().slice(0, 180));
  const selectedValues = selectedOptions.map(
    (option) => String(option.value || '').slice(0, 500)
  );
  const requestedLabels = requestedOptions.map((option) => String(
    option.textContent || option.label || option.value || ''
  ).replace(/\s+/g, ' ').trim().slice(0, 180));
  const requestedValues = requestedOptions.map(
    (option) => String(option.value || '').slice(0, 500)
  );
  const currentSorted = [...currentIndices].sort((left, right) => left - right);
  const alreadySelected =
    JSON.stringify(currentSorted) === JSON.stringify(targetIndices);
  const option = requestedOptions[0];
  const selectable = options.filter((entry) => {
    const disabledByGroup =
      String(entry.parentElement?.tagName || '').toLowerCase() === 'optgroup' &&
      entry.parentElement.disabled;
    return !entry.disabled && !disabledByGroup;
  });
  const selectionFingerprint = JSON.stringify({
    multiple: Boolean(element.multiple),
    mode,
    options: options.map((entry) => ({
      index: entry.index,
      label: String(entry.textContent || entry.label || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180),
      value: String(entry.value || '').slice(0, 500),
      disabled: Boolean(
        entry.disabled ||
        (
          String(entry.parentElement?.tagName || '').toLowerCase() === 'optgroup' &&
          entry.parentElement.disabled
        )
      )
    }))
  });
  return {
    ok: true,
    selected: String(option.textContent || option.label || '').trim().slice(0, 180),
    selectedValue: String(option.value || '').slice(0, 500),
    selectedIndex: option.index,
    enabledStep: selectable.indexOf(option),
    multiple: Boolean(element.multiple),
    mode,
    requestedLabels,
    requestedValues,
    selectedIndices: targetIndices,
    selectedLabels,
    selectedValues,
    selectionFingerprint,
    alreadySelected
  };
}

function applyReferencedOption(args) {
  const resolved = resolveReferencedOption(args);
  if (!resolved.ok) {
    return resolved;
  }
  if (
    resolved.selectionFingerprint !== String(args.expectedFingerprint || '') ||
    JSON.stringify(resolved.selectedIndices) !==
      JSON.stringify(args.expectedIndices || []) ||
    JSON.stringify(resolved.selectedLabels) !==
      JSON.stringify(args.expectedLabels || []) ||
    JSON.stringify(resolved.selectedValues) !==
      JSON.stringify(args.expectedValues || [])
  ) {
    return { ok: false, error: 'TARGET_CHANGED_DURING_APPROVAL' };
  }
  const result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }
  const element = result.element;
  const selectedSet = new Set(resolved.selectedIndices);
  for (const option of Array.from(element.options || [])) {
    option.selected = selectedSet.has(option.index);
  }
  if (!element.multiple) {
    element.selectedIndex = resolved.selectedIndex;
  }
  if (!resolved.alreadySelected) {
    const view = element.ownerDocument.defaultView;
    element.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new view.Event('change', { bubbles: true }));
  }
  return {
    ok: true,
    selected: resolved.selected,
    selectedValue: resolved.selectedValue,
    selectedIndex: resolved.selectedIndex,
    multiple: resolved.multiple,
    mode: resolved.mode,
    selectedIndices: resolved.selectedIndices,
    selectedLabels: resolved.selectedLabels,
    selectedValues: resolved.selectedValues,
    alreadySelected: resolved.alreadySelected
  };
}

function resolveReferencedValue(args) {
  const result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }
  const element = result.element;
  const tag = String(element.tagName || '').toLowerCase();
  const type = String(element.type || element.getAttribute?.('type') || '').toLowerCase();
  const supportedTypes = new Set([
    'color',
    'date',
    'datetime-local',
    'month',
    'number',
    'range',
    'time',
    'week'
  ]);
  if (tag !== 'input' || !supportedTypes.has(type)) {
    return { ok: false, error: 'ELEMENT_NOT_STRUCTURED_INPUT' };
  }
  if (
    element.disabled ||
    element.readOnly ||
    element.getAttribute?.('aria-disabled') === 'true'
  ) {
    return { ok: false, error: 'ELEMENT_NOT_INTERACTIVE' };
  }

  const requested = String(args.value ?? '');
  if (requested.length > 500) {
    return { ok: false, error: 'VALUE_TOO_LONG' };
  }
  if (type === 'color' && !/^#[0-9a-f]{6}$/i.test(requested)) {
    return { ok: false, error: 'INVALID_COLOR_VALUE' };
  }
  if (['number', 'range'].includes(type) && requested !== '') {
    const numeric = Number(requested);
    if (!Number.isFinite(numeric)) {
      return { ok: false, error: 'INVALID_NUMERIC_VALUE' };
    }
    const minimum = element.min === '' ? null : Number(element.min);
    const maximum = element.max === '' ? null : Number(element.max);
    if (
      (Number.isFinite(minimum) && numeric < minimum) ||
      (Number.isFinite(maximum) && numeric > maximum)
    ) {
      return { ok: false, error: 'VALUE_OUT_OF_RANGE' };
    }
  }

  const probe = element.ownerDocument.createElement('input');
  probe.type = type;
  for (const attribute of ['min', 'max', 'step']) {
    if (element.hasAttribute?.(attribute)) {
      probe.setAttribute(attribute, element.getAttribute(attribute));
    }
  }
  probe.value = requested;
  const normalized = String(probe.value || '');
  if (requested !== '' && normalized === '') {
    return { ok: false, error: 'INVALID_STRUCTURED_VALUE' };
  }
  if (
    probe.validity?.badInput ||
    probe.validity?.rangeOverflow ||
    probe.validity?.rangeUnderflow ||
    probe.validity?.stepMismatch
  ) {
    return { ok: false, error: 'VALUE_CONSTRAINT_MISMATCH' };
  }
  const constraintFingerprint = JSON.stringify({
    type,
    min: String(element.min || ''),
    max: String(element.max || ''),
    step: String(element.step || '')
  });
  return {
    ok: true,
    type,
    requested: requested.slice(0, 500),
    normalized: normalized.slice(0, 500),
    previous: String(element.value || '').slice(0, 500),
    constraintFingerprint,
    alreadySet: String(element.value || '') === normalized
  };
}

function applyReferencedValue(args) {
  const resolved = resolveReferencedValue(args);
  if (!resolved.ok) {
    return resolved;
  }
  if (
    resolved.normalized !== String(args.expectedValue ?? '') ||
    resolved.constraintFingerprint !== String(args.expectedFingerprint || '')
  ) {
    return { ok: false, error: 'TARGET_CHANGED_DURING_APPROVAL' };
  }
  const result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }
  const element = result.element;
  if (!resolved.alreadySet) {
    const view = element.ownerDocument.defaultView;
    const descriptor = Object.getOwnPropertyDescriptor(
      view.HTMLInputElement.prototype,
      'value'
    );
    if (!descriptor?.set) {
      return { ok: false, error: 'NATIVE_VALUE_SETTER_UNAVAILABLE' };
    }
    descriptor.set.call(element, resolved.normalized);
    element.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new view.Event('change', { bubbles: true }));
  }
  return {
    ok: true,
    type: resolved.type,
    value: resolved.normalized,
    previous: resolved.previous,
    alreadySet: resolved.alreadySet
  };
}

function submitReferencedForm(args) {
  const result = findReferencedElement(String(args.token || ''));
  if (!result) {
    return { ok: false, error: 'STALE_SNAPSHOT' };
  }

  const element = result.element;
  const submission = effectiveFormSubmission(element);
  const form = submission.form;
  if (!form) {
    return { ok: false, error: 'FORM_NOT_FOUND' };
  }

  let submitEvent = null;
  let invalidControl = null;
  const onSubmit = (event) => {
    submitEvent = event;
  };
  const onInvalid = (event) => {
    invalidControl ||= event.target;
  };
  form.addEventListener('submit', onSubmit);
  form.addEventListener('invalid', onInvalid, true);
  try {
    if (typeof form.requestSubmit === 'function') {
      if (submission.submitter) {
        form.requestSubmit(submission.submitter);
      } else {
        form.requestSubmit();
      }
    } else {
      const view = form.ownerDocument.defaultView;
      submitEvent = new view.Event('submit', {
        bubbles: true,
        cancelable: true
      });
      form.dispatchEvent(submitEvent);
    }
  } finally {
    form.removeEventListener('submit', onSubmit);
    form.removeEventListener('invalid', onInvalid, true);
  }
  return {
    ok: true,
    action: String(submission.action).slice(0, 1000),
    method: String(submission.method).toUpperCase(),
    submitEventObserved: Boolean(submitEvent),
    defaultPrevented: Boolean(submitEvent?.defaultPrevented),
    validationBlocked: Boolean(invalidControl && !submitEvent),
    invalidField: invalidControl
      ? elementAccessibleName(invalidControl) ||
        String(invalidControl.name || invalidControl.id || '').slice(0, 180)
      : ''
  };
}

function scrollDocument(args) {
  const direction = String(args.direction || 'down');
  const amount = Math.max(100, Math.min(2000, Number(args.amount) || 650));
  const delta = {
    down: [0, amount],
    up: [0, -amount],
    left: [-amount, 0],
    right: [amount, 0]
  }[direction] || [0, amount];
  window.scrollBy({ left: delta[0], top: delta[1], behavior: 'instant' });
  return {
    ok: true,
    x: Math.round(window.scrollX),
    y: Math.round(window.scrollY),
    maxY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  };
}

module.exports = {
  applyReferencedOption,
  applyReferencedValue,
  buildExecutionScript,
  inspectPageState,
  inspectReferencedElement,
  focusReferencedElement,
  matchPageCondition,
  prepareReferencedElement,
  resolveReferencedOption,
  resolveReferencedValue,
  scrollDocument,
  snapshotPage,
  submitReferencedForm
};
