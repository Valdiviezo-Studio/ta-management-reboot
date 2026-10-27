const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const text = (value, max = 500) => typeof value === 'string' && value.length <= max ? value.trim() : fail('Ungültiger oder zu langer Formularwert.');

/** The same validation runs in the authenticated local preview and Netlify adapter. */
export function normalizeSubmission(page, input) {
  if (!record(input) || input.version !== 1 || !uuid.test(input.submissionId || '') || input.jobSlug !== page.job.slug || input.revision !== page.revision || input.consent !== true) fail('Formularstand oder Einwilligung ungültig. Bitte die Seite neu laden.');
  if (!record(input.contact) || !record(input.answers) || !record(input.attribution)) fail('Das Formular ist unvollständig.');
  const job = page.job;
  const contact = { full_name: text(input.contact.full_name, 160), email: text(input.contact.email, 254).toLowerCase(), phone: text(input.contact.phone, 60) };
  if (contact.full_name.length < 2 || (!contact.phone && !contact.email) || (job.funnel.contact.emailRequired && !contact.email) || (job.funnel.contact.phoneRequired && !contact.phone)) fail('Bitte die erforderlichen Kontaktdaten ergänzen.');
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) fail('Bitte eine gültige E-Mail-Adresse verwenden.');
  const definitions = [...job.funnel.steps, ...(job.funnel.secondary ? [{ ...job.funnel.secondary, type: 'single', required: false }] : []), ...(job.funnel.secondarySteps || []).map(question => ({ ...question, type: 'single', required: false })), ...(job.funnel.optionalBeforeContact ? [{ ...job.funnel.optionalBeforeContact, required: false }] : [])];
  const answers = Object.create(null), formQuestions = [], known = new Set();
  for (const question of definitions) {
    if (question.enabled === false) continue;
    if (known.has(question.key)) fail('Die Formularkonfiguration enthält doppelte Fragen.');
    known.add(question.key);
    const raw = input.answers[question.key];
    const value = question.type === 'multi' ? (raw === undefined ? [] : Array.isArray(raw) && raw.length <= 30 ? [...new Set(raw.map(item => text(item)))] : fail('Ungültige Mehrfachantwort.')) : raw === undefined ? '' : text(raw);
    if (question.required !== false && (!value || Array.isArray(value) && !value.length)) fail(question.requiredMessage || 'Bitte alle Pflichtfragen beantworten.');
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    if (question.type !== 'text' && selected.some(item => !(question.options || []).some(option => option.value === item))) fail('Eine Antwort gehört nicht zu diesem Formular.');
    if (value.length) answers[question.key] = value;
    formQuestions.push({ key: question.key, label: question.question, type: question.type });
    for (const option of question.options || []) {
      if (selected.includes(option.value) && option.disqualifies) fail('Die Voraussetzungen müssen persönlich mit TA Management geklärt werden.');
      if (!option.followUp) continue;
      known.add(option.followUp.key);
      if (!selected.includes(option.value)) { if (input.answers[option.followUp.key]) fail('Eine Zusatzantwort gehört nicht zur Auswahl.'); continue; }
      const followUp = text(input.answers[option.followUp.key] || '');
      if (!followUp) fail(option.followUp.requiredMessage || 'Bitte die Zusatzfrage beantworten.');
      answers[option.followUp.key] = followUp;
      formQuestions.push({ key: option.followUp.key, label: option.followUp.question, type: 'text' });
    }
  }
  if (Object.keys(input.answers).some(key => !known.has(key))) fail('Das Formular enthält unbekannte Antworten.');
  const tracking = Object.create(null);
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id']) {
    if (input.attribution[key] !== undefined) tracking[key] = text(input.attribution[key], 160);
  }
  tracking.landing_page = `https://ta-management.de${page.path}`;
  tracking.is_organic = !Object.keys(tracking).some(key => /^(utm_|ad_|adset_|campaign_)/.test(key));
  return { kind: 'ta-application', version: 1, lead_id: input.submissionId, created_time: new Date().toISOString(), job_slug: job.slug, job_title: job.jobTitleLine, job_location: job.location, recruiter_id: job.recruiterId, recruiter_name: job.recruiterProfile?.name || '', form_id: `${page.draftId}:${page.revision}`, form_name: job.leadIngest.formName, platform: 'landingpage', form_questions: formQuestions, contact, answers, consent: true, tracking, lead_status: 'NEW' };
}
