/**
 * FHIR Resource Parsers
 * 
 * Transform FHIR resources into henry_health table schema.
 * Extracts key fields and generates human-readable summaries.
 */

/**
 * Parse FHIR Appointment resource
 * @param {Object} appointment - FHIR Appointment resource
 * @returns {Object} henry_health event
 */
function parseAppointment(appointment) {
  const id = `appt-${appointment.id}`;
  
  // Extract date/time
  const start = new Date(appointment.start);
  const date = start.toISOString().split('T')[0];
  const timestamp = appointment.start;

  // Extract participants (providers)
  const participants = appointment.participant
    ?.filter(p => p.actor?.display)
    .map(p => p.actor.display)
    .join(', ') || 'Unknown provider';

  // Extract location
  const location = appointment.participant
    ?.find(p => p.actor?.reference?.startsWith('Location/'))
    ?.actor?.display || 'Unknown location';

  // Extract appointment type
  const type = appointment.appointmentType?.text || 
               appointment.serviceType?.[0]?.text ||
               'Appointment';

  // Generate content summary
  const content = `${type} with ${participants} at ${location} on ${start.toLocaleDateString()} at ${start.toLocaleTimeString()}`;

  return {
    id,
    type: 'appointment',
    date,
    timestamp,
    content,
    metadata: {
      fhir_id: appointment.id,
      fhir_resource_type: 'Appointment',
      status: appointment.status,
      appointment_type: type,
      participants,
      location,
      start: appointment.start,
      end: appointment.end,
      description: appointment.description,
      raw: appointment
    },
    source: 'fhir'
  };
}

/**
 * Parse FHIR MedicationRequest resource
 * @param {Object} medRequest - FHIR MedicationRequest resource
 * @returns {Object} henry_health event
 */
function parseMedicationRequest(medRequest) {
  const id = `med-${medRequest.id}`;

  // Extract medication name
  const medication = medRequest.medicationCodeableConcept?.text ||
                    medRequest.medicationCodeableConcept?.coding?.[0]?.display ||
                    medRequest.medicationReference?.display ||
                    'Unknown medication';

  // Extract dosage
  const dosage = medRequest.dosageInstruction?.[0]?.text ||
                medRequest.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value ||
                'Unknown dosage';

  // Extract date
  const date = medRequest.authoredOn?.split('T')[0] || new Date().toISOString().split('T')[0];
  const timestamp = medRequest.authoredOn;

  // Generate content summary
  const status = medRequest.status;
  const content = `${medication} - ${dosage} (${status})`;

  return {
    id,
    type: 'medication',
    date,
    timestamp,
    content,
    metadata: {
      fhir_id: medRequest.id,
      fhir_resource_type: 'MedicationRequest',
      status: medRequest.status,
      medication,
      dosage,
      frequency: medRequest.dosageInstruction?.[0]?.timing?.code?.text,
      prescriber: medRequest.requester?.display,
      authored_on: medRequest.authoredOn,
      raw: medRequest
    },
    source: 'fhir'
  };
}

/**
 * Parse FHIR Observation resource (lab results)
 * @param {Object} observation - FHIR Observation resource
 * @returns {Object} henry_health event
 */
function parseObservation(observation) {
  const id = `obs-${observation.id}`;

  // Extract test name
  const test = observation.code?.text ||
              observation.code?.coding?.[0]?.display ||
              'Unknown test';

  // Extract value
  const value = observation.valueQuantity?.value ||
               observation.valueString ||
               observation.valueCodeableConcept?.text ||
               'N/A';
  
  const unit = observation.valueQuantity?.unit || '';

  // Extract date
  const date = observation.effectiveDateTime?.split('T')[0] ||
              observation.issued?.split('T')[0] ||
              new Date().toISOString().split('T')[0];
  const timestamp = observation.effectiveDateTime || observation.issued;

  // Generate content summary
  const valueStr = unit ? `${value} ${unit}` : value;
  const content = `${test}: ${valueStr}`;

  // Check for abnormal flag
  const interpretation = observation.interpretation?.[0]?.text ||
                        observation.interpretation?.[0]?.coding?.[0]?.code;

  return {
    id,
    type: 'lab_result',
    date,
    timestamp,
    content,
    metadata: {
      fhir_id: observation.id,
      fhir_resource_type: 'Observation',
      status: observation.status,
      category: observation.category?.[0]?.coding?.[0]?.code || 'laboratory',
      test,
      value,
      unit,
      interpretation,
      reference_range: observation.referenceRange?.[0]?.text,
      performer: observation.performer?.[0]?.display,
      raw: observation
    },
    source: 'fhir'
  };
}

/**
 * Parse FHIR Condition resource (diagnoses)
 * @param {Object} condition - FHIR Condition resource
 * @returns {Object} henry_health event
 */
function parseCondition(condition) {
  const id = `cond-${condition.id}`;

  // Extract condition name
  const diagnosis = condition.code?.text ||
                   condition.code?.coding?.[0]?.display ||
                   'Unknown condition';

  // Extract date
  const date = condition.onsetDateTime?.split('T')[0] ||
              condition.recordedDate?.split('T')[0] ||
              new Date().toISOString().split('T')[0];
  const timestamp = condition.onsetDateTime || condition.recordedDate;

  // Generate content summary
  const severity = condition.severity?.text || condition.severity?.coding?.[0]?.display;
  const status = condition.clinicalStatus?.coding?.[0]?.code;
  const content = `${diagnosis}${severity ? ` (${severity})` : ''} - ${status}`;

  return {
    id,
    type: 'diagnosis',
    date,
    timestamp,
    content,
    metadata: {
      fhir_id: condition.id,
      fhir_resource_type: 'Condition',
      clinical_status: status,
      verification_status: condition.verificationStatus?.coding?.[0]?.code,
      diagnosis,
      severity,
      onset: condition.onsetDateTime || condition.onsetString,
      recorded_date: condition.recordedDate,
      raw: condition
    },
    source: 'fhir'
  };
}

/**
 * Parse FHIR Bundle (collection of resources)
 * @param {Object} bundle - FHIR Bundle resource
 * @param {Function} parser - Parser function for resource type
 * @returns {Array<Object>} Array of henry_health events
 */
function parseBundle(bundle, parser) {
  if (!bundle.entry || !bundle.entry.length) {
    return [];
  }

  return bundle.entry
    .filter(entry => entry.resource)
    .map(entry => parser(entry.resource));
}

/**
 * Auto-detect and parse any FHIR resource
 * @param {Object} resource - FHIR resource
 * @returns {Object|null} henry_health event or null if unsupported
 */
function parseResource(resource) {
  const type = resource.resourceType;

  switch (type) {
    case 'Appointment':
      return parseAppointment(resource);
    case 'MedicationRequest':
      return parseMedicationRequest(resource);
    case 'Observation':
      return parseObservation(resource);
    case 'Condition':
      return parseCondition(resource);
    case 'Bundle':
      // Recursively parse bundle entries
      return parseBundle(resource, parseResource).filter(Boolean);
    default:
      console.warn(`Unsupported FHIR resource type: ${type}`);
      return null;
  }
}

module.exports = {
  parseAppointment,
  parseMedicationRequest,
  parseObservation,
  parseCondition,
  parseBundle,
  parseResource
};
