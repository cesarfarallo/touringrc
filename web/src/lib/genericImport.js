// Genera el GenericImport.csv que se importa manualmente en Live Timing --
// dirección web → Live Timing (Fase D del roadmap), lo opuesto de lo que
// procesa la Edge Function subir-resultado. Header real, tomado tal cual
// de touringrc-sync/files/GenericImport.csv (56 columnas) -- solo se
// completan las que tenemos dato: el resto queda vacío, Live Timing las
// tolera.
export const GENERIC_IMPORT_HEADER = [
  "FirstName", "LastName", "NickName", "PhoneticName", "Ability", "ClassName", "IsPaid",
  "PillNumber", "LocalRegisteredDateTime", "RegistrationNumber", "Region", "FrameNumber",
  "TireNumber", "PermanentNumber", "PrimaryColor", "SecondaryColor", "Manufacturer",
  "ChassisManufacturer", "ModelName", "ModelYear", "TransponderNumber", "CarID",
  "GPSTransponderNumber", "SponsorName", "Email", "PhoneNumber", "Birthday", "Gender",
  "Address1", "Address2", "City", "State", "ZipCode", "Country", "Hometown", "BRCANumber",
  "BRCARegion", "BRCADriverRanking", "BRCAFormulaGrade", "BRCASkillLevel",
  "BRCAIsYoungJunior", "BRCAIsJunior", "BRCAIsMasters", "EFRAAbility", "ClubName",
  "ClubRegion", "AmericanMotorcyclistAssociationNumber",
  "AmericanMotorcyclistAssociationExpirationDate", "AcademyOfModelAeronauticsNumber",
  "AcademyOfModelAeronauticsExpirationDate", "HAMCallSign", "FAANumber", "IJSBANumber",
  "LocalMembershipType", "LocalMembershipCode", "LocalMembershipExpirationDate",
];

function escaparCsv(valor) {
  const s = valor == null ? "" : String(valor);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// inscriptos: [{ first_name, last_name, clase_nombre, email, registration_number,
//                permanent_number, transponder_number }]
export function generarGenericImportCsv(inscriptos) {
  const filas = inscriptos.map((p) => {
    const campos = {
      FirstName: p.first_name,
      LastName: p.last_name,
      ClassName: p.clase_nombre,
      RegistrationNumber: p.registration_number,
      PermanentNumber: p.permanent_number,
      TransponderNumber: p.transponder_number,
      Email: p.email,
    };
    return GENERIC_IMPORT_HEADER.map((col) => escaparCsv(campos[col] ?? "")).join(",");
  });
  return [GENERIC_IMPORT_HEADER.join(","), ...filas].join("\r\n");
}

export function descargarCsv(nombreArchivo, contenido) {
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
