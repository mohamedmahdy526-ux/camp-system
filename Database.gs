/**
 * Database module for Camp Attendance System.
 * Fully header-based (no hardcoded column indices).
 */

var DB = {
  /**
   * Retrieves all headers of a given sheet.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @returns {string[]}
   */
  getHeaders: function(sheet) {
    var lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) return [];
    return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(h) {
      return h.toString().trim();
    });
  },

  /**
   * Finds the 1-based row index of a student by their phone number.
   * Compares normalized digit-only values to allow flexible matching.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} phone
   * @returns {number} 1-based row index, or -1 if not found.
   */
  findStudentRowIndex: function(sheet, phone) {
    var headers = this.getHeaders(sheet);
    var phoneColIdx = headers.indexOf("Phone");
    if (phoneColIdx === -1) {
      throw new Error("Column 'Phone' not found in Students sheet.");
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return -1;
    
    var phoneValues = sheet.getRange(2, phoneColIdx + 1, lastRow - 1, 1).getValues();
    var cleanInput = cleanPhoneForCompare(phone);
    
    for (var i = 0; i < phoneValues.length; i++) {
      var cleanDb = cleanPhoneForCompare(phoneValues[i][0]);
      if (cleanDb === cleanInput) {
        return i + 2; // 1-based index (header is row 1, index i is row i+2)
      }
    }
    return -1;
  },

  /**
   * Retrieves a student by phone as a key-value object.
   * @param {string} phone
   * @returns {object|null} Student data object or null.
   */
  getStudentByPhone: function(phone) {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_STUDENTS);
    if (!sheet) throw new Error("Students sheet not found.");
    
    var rowIndex = this.findStudentRowIndex(sheet, phone);
    if (rowIndex === -1) return null;
    
    var headers = this.getHeaders(sheet);
    var rowValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    
    var student = {};
    for (var i = 0; i < headers.length; i++) {
      student[headers[i]] = rowValues[i];
    }
    student._rowIndex = rowIndex; // Keep track of the row index
    return student;
  },

  /**
   * Inserts a new student record using header mapping.
   * @param {object} studentData Key-value representation of the student.
   */
  addStudent: function(studentData) {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_STUDENTS);
    if (!sheet) throw new Error("Students sheet not found.");
    
    var headers = this.getHeaders(sheet);
    if (headers.length === 0) {
      throw new Error("No headers found in the Students sheet.");
    }
    
    // Construct the row array matching the order of the headers
    var row = headers.map(function(header) {
      if (studentData.hasOwnProperty(header)) {
        var val = studentData[header];
        if (header === "Phone" && val) {
          var str = val.toString().trim();
          return str.indexOf("'") === 0 ? str : "'" + str;
        }
        return val;
      }
      // Check for S0..S15 dynamic headers with description text and set default FALSE
      if (/^S\d+:/.test(header)) {
        return false;
      }
      // Defaults for calculated fields
      if (header === "Total Attended") return 0;
      if (header === "Attendance Rate") return 0;
      if (header === "Certificate Eligible") return false;
      
      return "";
    });
    
    sheet.appendRow(row);
  },

  /**
   * Updates specific columns for a student identified by phone.
   * Performs a single batch row update (setValues) to minimize Spreadsheet API calls.
   * @param {string} phone Student phone number.
   * @param {object} updatesMap Key-value pairs of headers to update.
   * @param {number} [targetRowIndex] Optional known 1-based row index to skip lookup.
   */
  updateStudentFields: function(phone, updatesMap, targetRowIndex) {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_STUDENTS);
    if (!sheet) throw new Error("Students sheet not found.");
    
    var rowIndex = targetRowIndex || this.findStudentRowIndex(sheet, phone);
    if (rowIndex === -1) {
      throw new Error("Student with phone " + phone + " not found for update.");
    }
    
    var headers = this.getHeaders(sheet);
    if (headers.length === 0) return;
    
    var rowRange = sheet.getRange(rowIndex, 1, 1, headers.length);
    var rowValues = rowRange.getValues()[0];
    var modified = false;
    
    for (var key in updatesMap) {
      if (updatesMap.hasOwnProperty(key)) {
        var colIndex = headers.indexOf(key);
        if (colIndex !== -1) {
          rowValues[colIndex] = updatesMap[key];
          modified = true;
        }
      }
    }
    
    if (modified) {
      rowRange.setValues([rowValues]);
    }
  },

  /**
   * Appends an entry to the Attendance Log sheet.
   * @param {string} phone Student phone number.
   * @param {string|number} session Session identifier.
   */
  logAttendance: function(phone, session) {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_LOG);
    if (!sheet) throw new Error("Attendance Log sheet not found.");
    
    var headers = this.getHeaders(sheet);
    if (headers.length === 0) {
      throw new Error("No headers found in the Attendance Log sheet.");
    }
    
    var phoneStr = phone.toString().trim();
    var logData = {
      "Timestamp": new Date(),
      "Phone": phoneStr.indexOf("'") === 0 ? phoneStr : "'" + phoneStr,
      "Session": session
    };
    
    var row = headers.map(function(header) {
      return logData.hasOwnProperty(header) ? logData[header] : "";
    });
    
    sheet.appendRow(row);
  },

  /**
   * Fetches all questions for a given session.
   * @param {string|number} sessionIndex
   * @returns {Array} List of question objects.
   */
  getQuizQuestions: function(sessionIndex) {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_QUIZ_QUESTIONS);
    if (!sheet) return [];
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    
    var headers = this.getHeaders(sheet);
    var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var questions = [];
    
    var targetSess = sessionIndex.toString().trim();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rowSess = row[0].toString().trim();
      if (rowSess === targetSess) {
        var qObj = {};
        for (var j = 0; j < headers.length; j++) {
          qObj[headers[j]] = row[j];
        }
        questions.push(qObj);
      }
    }
    return questions;
  },

  /**
   * Saves a student's quiz score to the Quiz Grades sheet.
   */
  saveQuizGrade: function(phone, nameAr, nameEn, sessionIndex, score, totalQuestions) {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_QUIZ_GRADES);
    if (!sheet) throw new Error("Quiz Grades sheet not found.");
    
    var headers = this.getHeaders(sheet);
    if (headers.length === 0) {
      throw new Error("No headers found in Quiz Grades sheet.");
    }
    
    var phoneStr = phone.toString().trim();
    var percentage = totalQuestions > 0 ? (score / totalQuestions) : 0;
    
    var rowData = {
      "Timestamp": new Date(),
      "Phone": phoneStr.indexOf("'") === 0 ? phoneStr : "'" + phoneStr,
      "Name AR": nameAr,
      "Name EN": nameEn,
      "Session Index": sessionIndex,
      "Score": score,
      "Total Questions": totalQuestions,
      "Percentage": percentage
    };
    
    var row = headers.map(function(header) {
      return rowData.hasOwnProperty(header) ? rowData[header] : "";
    });
    
    sheet.appendRow(row);
  },

  /**
   * Gets a student's quiz grade if they've taken it.
   */
  getQuizGrade: function(phone, sessionIndex) {
    var ss = getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_QUIZ_GRADES);
    if (!sheet) return null;
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;
    
    var headers = this.getHeaders(sheet);
    var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    
    var cleanInputPhone = cleanPhoneForCompare(phone);
    var targetSess = sessionIndex.toString().trim();
    
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var rowPhone = cleanPhoneForCompare(row[1]);
      var rowSess = row[4].toString().trim();
      
      if (rowPhone === cleanInputPhone && rowSess === targetSess) {
        var gradeObj = {};
        for (var j = 0; j < headers.length; j++) {
          gradeObj[headers[j]] = row[j];
        }
        return gradeObj;
      }
    }
    return null;
  },

  /**
   * Ensures the Feedback Responses sheet exists and is formatted.
   */
  checkAndCreateFeedbackSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEET_FEEDBACK_RESPONSES);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_FEEDBACK_RESPONSES);
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
      sheet.appendRow(fHeaders);
      sheet.getRange(1, 1, 1, fHeaders.length).setFontWeight("bold").setBackground("#0284c7").setFontColor("#ffffff");
      sheet.getRange("B2:B").setNumberFormat("@");
      SpreadsheetApp.flush();
    }
    return sheet;
  },

  /**
   * Saves a student's feedback response to the Feedback Responses sheet.
   */
  saveFeedbackResponse: function(phone, nameAr, sessionIndex, answers) {
    var ss = getActiveSpreadsheet();
    var sheet = this.checkAndCreateFeedbackSheet(ss);
    
    var headers = this.getHeaders(sheet);
    if (headers.length === 0) {
      throw new Error("No headers found in Feedback Responses sheet.");
    }
    
    var phoneStr = phone.toString().trim();
    var rowData = {
      "Timestamp": new Date(),
      "Phone": phoneStr.indexOf("'") === 0 ? phoneStr : "'" + phoneStr,
      "Name AR": nameAr,
      "Session Index": sessionIndex,
      "Q1: Satisfaction": answers.q1,
      "Q2: Learning Outcome": answers.q2,
      "Q3: Instructor Performance": answers.q3,
      "Q4: Expectations": answers.q4,
      "Q5: Recommendation Probability": answers.q5,
      "Q6: Suggested Lectures": answers.q6,
      "Q7: Suggested Improvements": answers.q7
    };
    
    var row = headers.map(function(header) {
      return rowData.hasOwnProperty(header) ? rowData[header] : "";
    });
    
    sheet.appendRow(row);
  },

  /**
   * Gets a student's feedback response if they've submitted it.
   */
  getFeedbackResponse: function(phone, sessionIndex) {
    var ss = getActiveSpreadsheet();
    var sheet = this.checkAndCreateFeedbackSheet(ss);
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;
    
    var headers = this.getHeaders(sheet);
    var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    
    var cleanInputPhone = cleanPhoneForCompare(phone);
    var targetSess = sessionIndex.toString().trim();
    
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var rowPhone = cleanPhoneForCompare(row[1]);
      var rowSess = row[3].toString().trim();
      
      if (rowPhone === cleanInputPhone && rowSess === targetSess) {
        var respObj = {};
        for (var j = 0; j < headers.length; j++) {
          respObj[headers[j]] = row[j];
        }
        return respObj;
      }
    }
    return null;
  }
};

/**
 * Cleans phone numbers specifically for comparison (removes all non-digits, converts Arabic numerals).
 */
function cleanPhoneForCompare(phone) {
  if (!phone) return "";
  var str = phone.toString().trim();
  var arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  for (var i = 0; i < 10; i++) {
    var regex = new RegExp(arabicDigits[i], "g");
    str = str.replace(regex, i.toString());
  }
  return str.replace(/[^\d]/g, "");
}
