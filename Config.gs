/**
 * Configuration module for Camp Attendance System.
 * Manages global sheet names and loads dynamic settings from the Settings sheet.
 */

var CONFIG = {
  SHEET_STUDENTS: "Students",
  SHEET_SETTINGS: "Settings",
  SHEET_LOG: "Attendance Log",
  SHEET_QUIZ_QUESTIONS: "Quiz Questions",
  SHEET_QUIZ_GRADES: "Quiz Grades",
  SHEET_FEEDBACK_RESPONSES: "Feedback Responses"
};

/**
 * Reads settings from the Settings sheet.
 * Expected keys:
 * - CampName: String name of the camp.
 * - CurrentSession: Number/String representing the active session (e.g. 5 or S5 or 5).
 * - Attendance: "OPEN" or "CLOSED".
 * - MinAttendance: Number (default 10) representing min sessions for certificate eligibility.
 * 
 * @returns {object} Settings object.
 */
/**
 * Gets the active spreadsheet, falling back to a specific ID if necessary.
 */
function getActiveSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSettings() {
  try {
    var ss = getActiveSpreadsheet();
    if (!ss) {
      throw new Error("Active spreadsheet not found.");
    }
    
    var sheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
    if (!sheet) {
      throw new Error("Settings sheet not found. Please create a sheet named 'Settings'.");
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      throw new Error("Settings sheet is empty or lacks values under headers.");
    }
    
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var settings = {
      CampName: "Camp Attendance System",
      CurrentSession: "1",
      Attendance: "CLOSED",
      Quiz: "OPEN",
      Feedback: "OPEN",
      FacebookURL: "https://www.facebook.com/profile.php?id=61575638669904",
      MinAttendance: 10,
      AdminPIN: "1234"
    };
    
    for (var i = 0; i < data.length; i++) {
      var key = data[i][0];
      var value = data[i][1];
      if (key) {
        var cleanKey = key.toString().trim().toLowerCase();
        if (cleanKey === "minattendance" || cleanKey === "currentsession" || cleanKey === "feedbacksession") {
          var num = Number(value);
          var normalKey = cleanKey === "minattendance" ? "MinAttendance" : 
                            (cleanKey === "currentsession" ? "CurrentSession" : "FeedbackSession");
          settings[normalKey] = isNaN(num) ? value : num;
        } else if (cleanKey === "attendance") {
          settings.Attendance = value;
        } else if (cleanKey === "quiz") {
          settings.Quiz = value;
        } else if (cleanKey === "feedback") {
          settings.Feedback = value;
        } else if (cleanKey === "campname") {
          settings.CampName = value;
        } else if (cleanKey === "logourl") {
          settings.LogoURL = value;
        } else if (cleanKey === "facebookurl") {
          settings.FacebookURL = value;
        } else if (cleanKey === "adminpin") {
          settings.AdminPIN = value;
        } else {
          settings[key.toString().trim()] = value;
        }
      }
    }
    
    // Ensure AdminPIN is populated in the sheet if it wasn't there
    var hasPin = false;
    for (var k in settings) {
      if (k.toLowerCase() === "adminpin") {
        hasPin = true;
        break;
      }
    }
    if (!hasPin) {
      sheet.appendRow(["AdminPIN", "1234"]);
      SpreadsheetApp.flush();
    }
    
    return settings;
  } catch (e) {
    Logger.log("Error in getSettings: " + e.message);
    throw new Error("فشل في تحميل إعدادات النظام: " + e.message);
  }
}
