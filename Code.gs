/**
 * Entrypoint and API Router for Camp Attendance System.
 * Serves the HTML frontend and exposes functions for google.script.run client calls.
 */
// Production Deployment - Clean Build v5.6.1

/**
 * Serves the main HTML application.
 * @param {object} e HTTP GET request event object.
 * @returns {HtmlOutput} Evaluated HTML template.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === "true") {
    try {
      var action = e.parameter.action;
      var args = [];
      if (e.parameter.args) {
        try { args = JSON.parse(e.parameter.args); } catch(pe) {}
      }
      var res = processApiAction(action, args);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page.toString().toLowerCase() : "attendance";
  
  if (page === "quiz") {
    var template = HtmlService.createTemplateFromFile("QuizIndex");
    return template.evaluate()
      .setTitle("نظام الاختبارات - مبادرة ما ينفع الناس")
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
  } else if (page === "feedback") {
    var template = HtmlService.createTemplateFromFile("FeedbackIndex");
    template.phone = (e && e.parameter && e.parameter.phone) ? e.parameter.phone.toString() : "";
    return template.evaluate()
      .setTitle("استطلاع الرأي والتقييم - مبادرة ما ينفع الناس")
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
  } else if (page === "admin") {
    var template = HtmlService.createTemplateFromFile("AdminIndex");
    return template.evaluate()
      .setTitle("لوحة التحكم الإدارية - مبادرة ما ينفع الناس")
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
  } else {
    var template = HtmlService.createTemplateFromFile("AttendanceIndex");
    return template.evaluate()
      .setTitle("نظام تسجيل الحضور والغياب الكامب التدريبي")
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
  }
}

/**
 * Server-side include helper to inject Style.html and Script.html in Index.html.
 * @param {string} filename File name of the sub-HTML file without extension.
 * @returns {string} Raw HTML content.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gets the current system settings.
 * @returns {object} Settings JSON object.
 */
function getSystemSettings() {
  try {
    return getSettings();
  } catch (e) {
    Logger.log("API Error getSystemSettings: " + e.message);
    return { error: e.message };
  }
}

/**
 * Checks if student is registered and their session attendance status.
 * @param {string} phone Student phone.
 * @returns {object} Status object.
 */
function checkStudentStatus(phone) {
  try {
    return AttendanceService.checkStudentStatus(phone);
  } catch (e) {
    Logger.log("API Error checkStudentStatus: " + e.message);
    return { error: e.message };
  }
}

/**
 * Records attendance for an existing student.
 * @param {string} phone Student phone.
 * @returns {object} Success or error status.
 */
function submitAttendance(phone, requestId) {
  try {
    return AttendanceService.submitAttendance(phone, requestId);
  } catch (e) {
    Logger.log("API Error submitAttendance: " + e.message);
    var isLockOrBusy = /busy|locked|lock|timeout|خادم/i.test(e.message);
    return {
      success: false,
      retryable: isLockOrBusy,
      code: isLockOrBusy ? "SERVER_BUSY" : "SUBMIT_ERROR",
      error: e.message,
      message: e.message
    };
  }
}

/**
 * Registers a new student and records their attendance.
 * @param {object} studentData Key-value student record data from frontend.
 * @param {string} [requestId] Client idempotency request key.
 * @returns {object} Success or error status.
 */
function registerStudentAndAttend(studentData, requestId) {
  try {
    return AttendanceService.registerAndAttend(studentData, requestId);
  } catch (e) {
    Logger.log("API Error registerStudentAndAttend: " + e.message);
    var isLockOrBusy = /busy|locked|lock|timeout|خادم/i.test(e.message);
    return {
      success: false,
      retryable: isLockOrBusy,
      code: isLockOrBusy ? "SERVER_BUSY" : "REGISTER_ERROR",
      error: e.message,
      message: e.message
    };
  }
}

/**
 * Checks student eligibility and status for taking the quiz.
 */
function checkQuizStatus(phone) {
  try {
    return AttendanceService.checkQuizStatus(phone);
  } catch (e) {
    Logger.log("API Error checkQuizStatus: " + e.message);
    return { error: e.message };
  }
}

/**
 * Fetches secure questions list for the active session quiz.
 */
function getQuizQuestionsForSession(phone) {
  try {
    return AttendanceService.getQuizQuestionsForSession(phone);
  } catch (e) {
    Logger.log("API Error getQuizQuestionsForSession: " + e.message);
    return { error: e.message };
  }
}

/**
 * Submits student answers for grading and records it.
 */
function submitQuizAnswers(phone, answers) {
  try {
    return AttendanceService.submitQuizAnswers(phone, answers);
  } catch (e) {
    Logger.log("API Error submitQuizAnswers: " + e.message);
    return { error: e.message };
  }
}

/**
 * Verifies admin PIN code validity.
 */
function verifyAdminPIN(pin) {
  try {
    return AttendanceService.verifyAdminPIN(pin);
  } catch (e) {
    Logger.log("API Error verifyAdminPIN: " + e.message);
    return { error: e.message };
  }
}

/**
 * Gets stats and settings for the admin dashboard.
 */
function getAdminDashboardData(pin) {
  try {
    return AttendanceService.getAdminDashboardData(pin);
  } catch (e) {
    Logger.log("API Error getAdminDashboardData: " + e.message);
    return { error: e.message };
  }
}

/**
 * Updates multiple settings from the admin control panel.
 */
function updateAdminSettings(pin, updates) {
  try {
    return AttendanceService.updateAdminSettings(pin, updates);
  } catch (e) {
    Logger.log("API Error updateAdminSettings: " + e.message);
    return { error: e.message };
  }
}

/**
 * Checks feedback registration status and duplicate submissions.
 */
function checkFeedbackStatus(phone) {
  try {
    return AttendanceService.checkFeedbackStatus(phone);
  } catch (e) {
    Logger.log("API Error checkFeedbackStatus: " + e.message);
    return { error: e.message };
  }
}

/**
 * Submits feedback responses.
 */
function submitFeedbackAnswers(phone, answers) {
  try {
    return AttendanceService.submitFeedbackAnswers(phone, answers);
  } catch (e) {
    Logger.log("API Error submitFeedbackAnswers: " + e.message);
    return { error: e.message };
  }
}

/**
 * Sets up the Google Sheet database automatically.
 * Run this function once from the Apps Script editor to initialize sheets and headers.
 */
function setupSheets() {
  var ss = getActiveSpreadsheet();
  if (!ss) {
    throw new Error("Active spreadsheet not found.");
  }
  
  // 1. Settings Sheet
  var settingsSheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(CONFIG.SHEET_SETTINGS);
  }
  if (settingsSheet.getLastRow() <= 1) {
    settingsSheet.clear();
    settingsSheet.appendRow(["Key", "Value"]);
    settingsSheet.appendRow(["CampName", "كامب الامتياز لطلاب التمريض - مبادرة ما ينفع الناس"]);
    settingsSheet.appendRow(["CurrentSession", "0"]); // Start with 0 (Orientation)
    settingsSheet.appendRow(["Attendance", "OPEN"]);
    settingsSheet.appendRow(["MinAttendance", "13"]);
    settingsSheet.appendRow(["LogoURL", "https://lh3.googleusercontent.com/d/167rdAQntynxuH3mRHZYa6eabz4qRiyYR"]);
    settingsSheet.appendRow(["AdminPIN", "1234"]);
    // Format headers
    settingsSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#cbd5e1");
    Logger.log("Created/Reset Settings sheet.");
  }
  
  // 2. Students Sheet
  var studentsSheet = ss.getSheetByName(CONFIG.SHEET_STUDENTS);
  if (!studentsSheet) {
    studentsSheet = ss.insertSheet(CONFIG.SHEET_STUDENTS);
  }
  
  var hasHeaders = false;
  try {
    var hdrs = DB.getHeaders(studentsSheet);
    if (hdrs && hdrs.indexOf("Phone") !== -1) {
      hasHeaders = true;
    }
  } catch(e) {}
  
  if (!hasHeaders || studentsSheet.getLastRow() <= 1) {
    studentsSheet.clear();
    var headers = ["Phone", "Name AR", "Name EN", "University", "Email"];
    
    // Exact Session Titles mapped to columns S0 to S15
    var sessionsList = [
      "S0: Opening & Orientation",
      "S1: Interview Skills, CV & LinkedIn",
      "S2: Professional Autonomy",
      "S3: ECG Interpretation",
      "S4: Medication Safety",
      "S5: ABG Interpretation & Deterioration",
      "S6: Trauma, Stroke & ACS",
      "S7: Ventilated Patients",
      "S8: Panic Situations - Lines, Tubes",
      "S9: Code Blue & Crash Cart",
      "S10: Infection Control (IPC)",
      "S11: Quality & Patient Safety",
      "S12: Soft Skills",
      "S13: Communication & SBAR",
      "S14: Career Development",
      "S15: Closing Ceremony"
    ];
    
    for (var i = 0; i < sessionsList.length; i++) {
      headers.push(sessionsList[i]);
    }
    
    headers.push("Total Attended", "Attendance Rate", "Certificate Eligible");
    studentsSheet.appendRow(headers);
    // Format headers
    studentsSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff");
    Logger.log("Created/Reset Students sheet.");
  }
  
  // 3. Attendance Log Sheet
  var logSheet = ss.getSheetByName(CONFIG.SHEET_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.SHEET_LOG);
  }
  if (logSheet.getLastRow() <= 1) {
    logSheet.clear();
    var logHeaders = ["Timestamp", "Phone", "Session"];
    logSheet.appendRow(logHeaders);
    // Format headers
    logSheet.getRange("A1:C1").setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
    Logger.log("Created/Reset Attendance Log sheet.");
  }
  
  // 4. Session Info Metadata Sheet
  var infoSheet = ss.getSheetByName("Sessions Guide");
  if (!infoSheet) {
    infoSheet = ss.insertSheet("Sessions Guide");
  }
  if (infoSheet.getLastRow() <= 1) {
    infoSheet.clear();
    infoSheet.appendRow(["Index", "Date & Day", "Time", "Module", "Session Topic", "Instructor"]);
    
    var sessionsGuideData = [
      ["0", "Jul 31, 2026 (Friday)", "06:00 PM - 06:30 PM", "Opening & Orientation", "Camp welcome & orientation", "Dr. Mohamed Mansour / Dr. Amal Mohamed"],
      ["1", "Jul 31, 2026 (Friday)", "06:30 PM - 09:00 PM", "Module 1: Professional Identity", "Interview Skills, CV Writing & LinkedIn", "Dr. Ali Abdelfatah"],
      ["2", "Aug 01, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Module 1: Professional Identity", "Professional Autonomy & Accountability", "Dr. Mohamed Elbehairy"],
      ["3", "Aug 07, 2026 (Friday)", "06:00 PM - 09:00 PM", "Module 2: Clinical Nursing Practice", "ECG Interpretation", "Dr. Ibrahim Youssef"],
      ["4", "Aug 08, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Module 2: Clinical Nursing Practice", "Medication Safety & High Alert Medications", "Dr. Esraa Ezat"],
      ["5", "Aug 14, 2026 (Friday)", "06:00 PM - 09:00 PM", "Module 2: Clinical Nursing Practice", "ABG Interpretation & Early Recognition of Patient Deterioration", "Dr. Basma Elwekeel"],
      ["6", "Aug 15, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Module 2: Clinical Nursing Practice", "Trauma, Stroke & Acute Coronary Syndrome (ACS)", "Dr. Abdallah Ali"],
      ["7", "Aug 21, 2026 (Friday)", "06:00 PM - 09:00 PM", "Module 2: Clinical Nursing Practice", "Care of Mechanically Ventilated Patients", "Dr. Abdallah Mamdouh"],
      ["8", "Aug 22, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Module 2: Clinical Nursing Practice", "Panic Situations - Lines, Tubes & Drains Management", "Dr. Ahmed Adham"],
      ["9", "Aug 28, 2026 (Friday)", "06:00 PM - 09:00 PM", "Module 2: Clinical Nursing Practice", "Code Blue Management & Crash Cart", "Dr. Mahmoud Samir"],
      ["10", "Aug 29, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Module 3: Patient Safety & Quality", "Infection Prevention and Control (IPC)", "Dr. Shaimaa Seada"],
      ["11", "Aug 29, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Module 3: Patient Safety & Quality", "Quality Improvement & Patient Safety", "Dr. Ashraf Lamlom"],
      ["12", "Sep 04, 2026 (Friday)", "06:00 PM - 09:00 PM", "Module 4: Soft Skills & Communication", "Soft Skills", "Dr. Mahmoud Eid"],
      ["13", "Sep 05, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Module 4: Soft Skills & Communication", "Communication Skills, SBAR Handoff & Documentation", "Dr. Ahmed Elshaer"],
      ["14", "Sep 11, 2026 (Friday)", "06:00 PM - 09:00 PM", "Module 5: Career Readiness", "Career Development & Professional Opportunities", "Dr. Mohamed Elbadrawy"],
      ["15", "Sep 12, 2026 (Saturday)", "06:00 PM - 09:00 PM", "Open Discussion & Closing Ceremony", "Open Discussion & Closing Ceremony", "Dr. Mohamed Mansour / Dr. Mahmoud Abo Elmagd"]
    ];
    
    for (var j = 0; j < sessionsGuideData.length; j++) {
      infoSheet.appendRow(sessionsGuideData[j]);
    }
    
    infoSheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#0284c7").setFontColor("#ffffff");
    Logger.log("Created/Reset Sessions Guide sheet.");
  }
  
  // 5. Quiz Questions Sheet
  var questionsSheet = ss.getSheetByName(CONFIG.SHEET_QUIZ_QUESTIONS);
  if (!questionsSheet) {
    questionsSheet = ss.insertSheet(CONFIG.SHEET_QUIZ_QUESTIONS);
    var qHeaders = ["Session Index", "Question ID", "Question Text", "Type", "Option A", "Option B", "Option C", "Option D", "Correct Option"];
    questionsSheet.appendRow(qHeaders);
    questionsSheet.getRange(1, 1, 1, qHeaders.length).setFontWeight("bold").setBackground("#9333ea").setFontColor("#ffffff");
    
    // Add sample questions
    var sampleQuestions = [
      ["0", "1", "ما هو موضوع المحاضرة التمهيدية (Session 0)؟", "MCQ", "ECG Interpretation", "Opening & Orientation", "Soft Skills", "Code Blue Management", "B"],
      ["0", "2", "المحاضرة التمهيدية كانت يوم الجمعة 31 يوليو 2026.", "TF", "صح (True)", "خطأ (False)", "", "", "A"],
      ["1", "1", "من هو المحاضر في Session 1: Interview Skills, CV Writing & LinkedIn؟", "MCQ", "Dr. Ali Abdelfatah", "Dr. Mohamed Elbehairy", "Dr. Esraa Ezat", "Dr. Ibrahim Youssef", "A"],
      ["1", "2", "تتضمن Session 1 موضوع كتابة السيرة الذاتية CV وقنوات LinkedIn الاحترافية.", "TF", "صح (True)", "خطأ (False)", "", "", "A"]
    ];
    for (var k = 0; k < sampleQuestions.length; k++) {
      questionsSheet.appendRow(sampleQuestions[k]);
    }
    Logger.log("Created Quiz Questions sheet and added sample questions.");
  }
  
  // 6. Quiz Grades Sheet
  var gradesSheet = ss.getSheetByName(CONFIG.SHEET_QUIZ_GRADES);
  if (!gradesSheet) {
    gradesSheet = ss.insertSheet(CONFIG.SHEET_QUIZ_GRADES);
    var gHeaders = ["Timestamp", "Phone", "Name AR", "Name EN", "Session Index", "Score", "Total Questions", "Percentage"];
    gradesSheet.appendRow(gHeaders);
    gradesSheet.getRange(1, 1, 1, gHeaders.length).setFontWeight("bold").setBackground("#db2777").setFontColor("#ffffff");
    // Format phone column as Plain Text
    gradesSheet.getRange("B2:B").setNumberFormat("@");
    Logger.log("Created Quiz Grades sheet.");
  }
  
  // 7. Feedback Responses Sheet
  var feedbackSheet = ss.getSheetByName(CONFIG.SHEET_FEEDBACK_RESPONSES);
  if (!feedbackSheet) {
    feedbackSheet = ss.insertSheet(CONFIG.SHEET_FEEDBACK_RESPONSES);
    var fHeaders = [
      "Timestamp", 
      "Phone", 
      "Name AR", 
      "Session Index", 
      "Q1: Satisfaction", 
      "Q2: Learning Outcome", 
      "Q3: Instructor Performance", 
      "Q4: Expectations", 
      "Q5: Recommendation Probability", 
      "Q6: Suggested Lectures", 
      "Q7: Suggested Improvements"
    ];
    feedbackSheet.appendRow(fHeaders);
    feedbackSheet.getRange(1, 1, 1, fHeaders.length).setFontWeight("bold").setBackground("#0284c7").setFontColor("#ffffff");
    // Format phone column as Plain Text
    feedbackSheet.getRange("B2:B").setNumberFormat("@");
    Logger.log("Created Feedback Responses sheet.");
  }
  
  // Delete default "Sheet1" if it exists and is empty
  var sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && sheet1.getLastRow() === 0 && sheet1.getLastColumn() === 0) {
    try {
      ss.deleteSheet(sheet1);
      Logger.log("Deleted empty default Sheet1.");
    } catch (e) {
      Logger.log("Could not delete Sheet1: " + e.message);
    }
  }
  
  // 8. Certificate Earners Sheet
  var certSheet = ss.getSheetByName("المستحقين للشهادات");
  if (!certSheet) {
    certSheet = ss.insertSheet("المستحقين للشهادات");
  }
  certSheet.clear();
  certSheet.getRange("A1").setValue('=QUERY(Students!A:X, "SELECT A, B, C, D, E, V, W WHERE X = TRUE", 1)');
  certSheet.getRange("A1:G1").setFontWeight("bold").setBackground("#10b981").setFontColor("#ffffff");
  Logger.log("Created/Reset Certificate Earners sheet.");
  
  return "تم تهيئة قاعدة البيانات بنجاح! تم إنشاء جدول إرشادي المحاضرات وجدول المستحقين للشهادات.";
}

/**
 * Automatically runs when the spreadsheet is opened.
 * Adds a custom admin menu to the spreadsheet UI.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('لوحة تحكم الحضور 📝')
      .addItem('تهيئة الجداول (أول مرة)', 'setupSheets')
      .addSeparator()
      .addItem('فتح تسجيل الحضور', 'adminOpenAttendance')
      .addItem('إغلاق تسجيل الحضور', 'adminCloseAttendance')
      .addSeparator()
      .addItem('الانتقال للمحاضرة التالية', 'adminAdvanceSession')
      .addToUi();
}

function adminOpenAttendance() {
  setSettingValue("Attendance", "OPEN");
  SpreadsheetApp.getUi().alert("تم فتح تسجيل الحضور بنجاح!");
}

function adminCloseAttendance() {
  setSettingValue("Attendance", "CLOSED");
  SpreadsheetApp.getUi().alert("تم إغلاق تسجيل الحضور بنجاح!");
}

function adminAdvanceSession() {
  var settings = getSettings();
  var current = Number(settings.CurrentSession);
  if (isNaN(current)) {
    SpreadsheetApp.getUi().alert("خطأ: المحاضرة الحالية ليست رقماً صالحاً في الإعدادات.");
    return;
  }
  
  var sessions = [
    "التمهيد والترحيب (Opening & Orientation)",
    "Session 1: Interview Skills, CV Writing & LinkedIn",
    "Session 2: Professional Autonomy & Accountability",
    "Session 3: ECG Interpretation",
    "Session 4: Medication Safety & High Alert Medications",
    "Session 5: ABG Interpretation & Patient Deterioration",
    "Session 6: Trauma, Stroke & Acute Coronary Syndrome",
    "Session 7: Care of Mechanically Ventilated Patients",
    "Session 8: Panic Situations - Lines, Tubes & Drains",
    "Session 9: Code Blue Management & Crash Cart",
    "Session 10: Infection Prevention and Control (IPC)",
    "Session 11: Quality Improvement & Patient Safety",
    "Session 12: Soft Skills",
    "Session 13: Communication Skills, SBAR & Documentation",
    "Session 14: Career Development & Opportunities",
    "المناقشة المفتوحة وحفل الختام (Closing Ceremony)"
  ];

  if (current >= sessions.length - 1) {
    SpreadsheetApp.getUi().alert("تنبيه: أنت بالفعل في المحاضرة الأخيرة (" + sessions[current] + ").");
    return;
  }
  
  var next = current + 1;
  setSettingValue("CurrentSession", next.toString());
  SpreadsheetApp.getUi().alert("تم الانتقال إلى: " + sessions[next] + " بنجاح!");
}

function setSettingValue(key, value) {
  var ss = getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
  if (!sheet) throw new Error("Settings sheet not found.");
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim().toLowerCase() === key.toLowerCase()) {
        sheet.getRange(i + 2, 2).setValue(value);
        SpreadsheetApp.flush();
        return;
      }
    }
  }
  
  // Key not found; append it dynamically
  sheet.appendRow([key, value]);
  SpreadsheetApp.flush();
}

function processApiAction(action, args) {
  args = args || [];
  if (action === "getSystemSettings") {
    return getSystemSettings();
  } else if (action === "checkStudentStatus") {
    return checkStudentStatus(args[0]);
  } else if (action === "submitAttendance") {
    return submitAttendance(args[0], args[1]);
  } else if (action === "registerStudentAndAttend") {
    return registerStudentAndAttend(args[0], args[1]);
  } else if (action === "checkQuizStatus") {
    return checkQuizStatus(args[0]);
  } else if (action === "getQuizQuestionsForSession") {
    return getQuizQuestionsForSession(args[0]);
  } else if (action === "submitQuizAnswers") {
    return submitQuizAnswers(args[0], args[1]);
  } else if (action === "checkFeedbackStatus") {
    return checkFeedbackStatus(args[0]);
  } else if (action === "submitFeedbackAnswers") {
    return submitFeedbackAnswers(args[0], args[1]);
  } else if (action === "getAdminDashboardData") {
    return getAdminDashboardData(args[0]);
  } else if (action === "verifyAdminPIN") {
    return verifyAdminPIN(args[0]);
  } else if (action === "updateAdminSettings") {
    return updateAdminSettings(args[0], args[1]);
  } else {
    throw new Error("Action not supported: " + action);
  }
}

/**
 * Handles API POST requests from external domains (e.g. GitHub Pages).
 * Acts as a router to expose server functions via REST JSON.
 */
function doPost(e) {
  try {
    var requestData;
    if (e && e.postData && e.postData.contents) {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch(pe) {
        requestData = e.parameter || {};
      }
    } else {
      requestData = (e && e.parameter) ? e.parameter : {};
    }
    
    var action = requestData.action;
    var args = requestData.args || [];
    if (typeof args === "string") {
      try { args = JSON.parse(args); } catch(pa) {}
    }
    
    var result = processApiAction(action, args);
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


