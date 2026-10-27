/* Public TA form runtime. Contact/answers stay in memory until explicit submission. */
(() => {
  'use strict';
  const page = JSON.parse(document.getElementById('jarvis-page').textContent);
  const job = page.job, form = document.getElementById('application-form'), host = document.getElementById('question');
  const error = document.getElementById('form-error'), next = document.getElementById('next'), previous = document.getElementById('previous');
  const answers = {}, contact = { full_name: '', email: '', phone: '' };
  const submissionId = crypto.randomUUID();
  const steps = [...job.funnel.steps];
  if (job.funnel.optionalBeforeContact) steps.push({ ...job.funnel.optionalBeforeContact, cardTitle: 'Optional', required: false, options: [] });
  let index = 0, consent = false, busy = false;
  const node = (tag, text, parent = host) => { const element = document.createElement(tag); if (text) element.textContent = text; parent.append(element); return element; };
  const field = (label, key, parent = host, type = 'text', values = answers) => {
    const wrap = node('label', label, parent); wrap.className = 'field';
    const input = node('input', '', wrap); input.type = type; input.name = key; input.maxLength = 500;
    input.value = values[key] || ''; input.addEventListener('input', () => { values[key] = input.value; error.textContent = ''; });
    return input;
  };
  const selected = (step, option) => Array.isArray(answers[step.key]) ? answers[step.key].includes(option.value) : answers[step.key] === option.value;
  function choice(step, parent) {
    const set = node('fieldset', '', parent); node('legend', step.question, set);
    if (step.hint) node('p', step.hint, set).className = 'hint';
    for (const option of step.options || []) {
      const label = node('label', '', set); label.className = 'option';
      const input = node('input', '', label); input.type = step.type === 'multi' ? 'checkbox' : 'radio'; input.name = step.key; input.value = option.value; input.checked = selected(step, option);
      node('span', option.label, label);
      input.addEventListener('change', () => {
        if (step.type === 'multi') { const values = new Set(answers[step.key] || []); input.checked ? values.add(option.value) : values.delete(option.value); answers[step.key] = [...values]; }
        else answers[step.key] = option.value;
        for (const candidate of step.options || []) if (candidate.followUp && !selected(step, candidate)) delete answers[candidate.followUp.key];
        error.textContent = ''; render();
        [...host.querySelectorAll('input')].find(candidate => candidate.name === step.key && candidate.value === option.value)?.focus();
      });
      if (selected(step, option) && option.followUp) field(option.followUp.question, option.followUp.key, set);
    }
  }
  function render() {
    host.replaceChildren(); error.textContent = ''; previous.hidden = index === 0; next.textContent = index < steps.length ? 'Weiter →' : (job.funnel.contact.submitLabel || 'Absenden');
    node('p', `Schritt ${index + 1} von ${steps.length + 1}`, host).className = 'progress';
    if (index < steps.length) {
      const step = steps[index];
      if (step.type === 'text') { const set = node('fieldset'); node('legend', step.question, set); if (step.hint) node('p', step.hint, set).className = 'hint'; field('Deine Antwort', step.key, set); }
      else choice(step, host);
      const secondary = [...(job.funnel.secondarySteps || []), ...(job.funnel.secondary ? [job.funnel.secondary] : [])].filter(item => item.enabled && item.attachAfterStepKey === step.key);
      for (const item of secondary) choice({ ...item, type: 'single' }, host);
    } else {
      const set = node('fieldset'); node('legend', job.funnel.contact.question, set);
      node('p', job.funnel.contact.hint, set).className = 'hint';
      field('Dein Name *', 'full_name', set, 'text', contact).autocomplete = 'name';
      field(`E-Mail${job.funnel.contact.emailRequired ? ' *' : ''}`, 'email', set, 'email', contact).autocomplete = 'email';
      field(`Telefon${job.funnel.contact.phoneRequired ? ' *' : ''}`, 'phone', set, 'tel', contact).autocomplete = 'tel';
      const trap = field('Website', 'website', set); trap.parentElement.className = 'honeypot'; trap.tabIndex = -1; trap.autocomplete = 'off';
      const label = node('label', '', set); label.className = 'consent';
      const check = node('input', '', label); check.type = 'checkbox'; check.checked = consent; check.addEventListener('change', () => { consent = check.checked; });
      const text = node('span', job.funnel.contact.consentText || 'Ich habe die Datenschutzhinweise gelesen.', label);
      text.append(' '); const link = node('a', 'Datenschutz', text); link.href = 'https://ta-management.de/datenschutz.html'; link.target = '_blank'; link.rel = 'noopener';
      if (page.mode === 'preview') node('p', 'Testmodus: Bitte eine erfundene Adresse mit @example.invalid verwenden. Es wird keine E-Mail versendet.', set).className = 'hint';
    }
  }
  function checkStep(step) {
    const value = answers[step.key];
    if (step.required !== false && (!value || (Array.isArray(value) && !value.length) || (typeof value === 'string' && !value.trim()))) return step.requiredMessage || 'Bitte beantworte diese Frage.';
    for (const option of step.options || []) if (selected(step, option)) {
      if (option.disqualifies) return job.funnel.disqualification?.text || 'Bitte besprich die Voraussetzungen persönlich mit TA Management.';
      if (option.followUp && !String(answers[option.followUp.key] || '').trim()) return option.followUp.requiredMessage || 'Bitte ergänze deine Antwort.';
    }
    return '';
  }
  previous.addEventListener('click', () => { if (!busy) { index = Math.max(0, index - 1); render(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    if (index < steps.length) { const message = checkStep(steps[index]); if (message) { error.textContent = message; return; } index++; render(); host.querySelector('legend')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (!contact.full_name.trim()) { error.textContent = 'Bitte gib deinen Namen an.'; return; }
    if ((job.funnel.contact.emailRequired && !contact.email.trim()) || (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))) { error.textContent = 'Bitte gib eine gültige E-Mail-Adresse an.'; return; }
    if ((job.funnel.contact.phoneRequired && !contact.phone.trim()) || (!contact.phone.trim() && !contact.email.trim())) { error.textContent = 'Bitte ergänze eine Kontaktmöglichkeit.'; return; }
    if (!consent) { error.textContent = 'Bitte bestätige die Datenschutzhinweise.'; return; }
    if (answers.website) { error.textContent = 'Die Anfrage konnte nicht verarbeitet werden.'; return; }
    const attribution = {}; const query = new URLSearchParams(location.search);
    for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id']) { const value = query.get(key); if (value) attribution[key] = value.slice(0, 160); }
    busy = true; next.disabled = true; previous.disabled = true; next.textContent = 'Wird gespeichert …';
    try {
      const response = await fetch(page.submitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, submissionId, jobSlug: job.slug, revision: page.revision, contact, answers: Object.fromEntries(Object.entries(answers).filter(([key]) => key !== 'website')), consent: true, attribution }) });
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.leadId !== submissionId || !result.applicationId) throw new Error(result.reason || 'Die Speicherung wurde nicht bestätigt. Bitte versuche es erneut.');
      form.hidden = true; const success = document.getElementById('success'); success.hidden = false;
      node('h3', result.mode === 'local-test' ? 'Testanfrage lokal gespeichert' : 'Danke für deine Bewerbung.', success);
      node('p', result.mode === 'local-test' ? 'Keine Übertragung an Kandidatenportal oder CRM. Keine E-Mail versendet.' : 'Deine Bewerbung wurde bestätigt gespeichert. Der persönliche Portalzugang wird separat bereitgestellt.', success);
    } catch (failure) { error.textContent = failure.message || 'Die Anfrage konnte nicht gespeichert werden.'; }
    finally { busy = false; next.disabled = false; previous.disabled = false; next.textContent = job.funnel.contact.submitLabel || 'Absenden'; }
  });
  render();
})();
