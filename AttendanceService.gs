/**
 * AttendanceService module for Camp Attendance System.
 * Manages the business logic for checking, registering, and recording student attendance.
 * Incorporates LockService for transaction safety and dynamic recalculation.
 */

var AttendanceService = {
  /**
   * Cleans and normalizes phone numbers.
   * Converts Arabic digits to English and removes all non-numeric characters (except leading '+').
   * @param {string} phone
   * @returns {string} Cleaned phone number.
   */
  cleanPhone: function(phone) {
    if (!phone) return "";
    var clean = phone.toString().trim();
    
    // Convert Arabic-Indic digits to standard Western digits
    var arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    for (var i = 0; i < 10; i++) {
      var regex = new RegExp(arabicDigits[i], "g");
      clean = clean.replace(regex, i.toString());
    }
    
    // Remove everything that isn't a digit or '+'
    clean = clean.replace(/[^\d+]/g, "");
    return clean;
  },

  /**
   * Validates Email format.
   * @param {string} email
   * @returns {boolean}
   */
  isValidEmail: function(email) {
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Formats a string to Title Case.
   * @param {string} str
   * @returns {string} Formatted string.
   */
  toTitleCase: function(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/\b\w/g, function(char) {
      return char.toUpperCase();
    });
  },

  /**
   * Translates current session index (0 to 15) to the actual sheet header column name.
   * @param {string|number} session
   * @returns {string}
   */
  getSessionKey: function(session) {
    var sessStr = session.toString().trim();
    
    // List of exact session header prefixes
    var prefixes = [
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
    
    var idx = parseInt(sessStr.replace(/[^\d]/g, ""), 10);
    if (!isNaN(idx) && idx >= 0 && idx < prefixes.length) {
      return prefixes[idx];
    }
    
    // Fallback in case a raw header name is passed
    return sessStr;
  },

  /**
   * Evaluates student status for the current session.
   * @param {string} phoneRaw
   * @returns {object} Status metadata.
   */
  checkStudentStatus: function(phoneRaw) {
    var settings = getSettings();
    var campName = settings.CampName || "Camp";
    var currentSession = settings.CurrentSession || "1";
    var isClosed = (settings.Attendance || "").toString().toUpperCase() !== "OPEN";
    
    if (isClosed) {
      return {
        status: "CLOSED",
        campName: campName,
        message: "تسجيل الحضور مغلق حالياً."
      };
    }
    
    var phone = this.cleanPhone(phoneRaw);
    if (!phone || phone.length < 8) {
      return {
        status: "INVALID_PHONE",
        campName: campName,
        message: "يرجى إدخال رقم هاتف صحيح."
      };
    }
    
    var student = DB.getStudentByPhone(phone);
    var sessionKey = this.getSessionKey(currentSession);
    
    if (!student) {
      return {
        status: "NOT_FOUND",
        phone: phone,
        session: currentSession,
        campName: campName
      };
    }
    
    // Check if already registered for current session
    var alreadyAttended = student[sessionKey] === true || student[sessionKey] === "TRUE" || student[sessionKey] === "true";
    if (alreadyAttended) {
      return {
        status: "ALREADY_ATTENDED",
        studentName: student["Name AR"],
        nameEn: student["Name EN"],
        university: student["University"],
        email: student["Email"],
        session: currentSession,
        campName: campName,
        message: "لقد قمت بتسجيل حضورك بالفعل في هذه المحاضرة."
      };
    }
    
    return {
      status: "FOUND",
      studentName: student["Name AR"],
      nameEn: student["Name EN"],
      university: student["University"],
      email: student["Email"],
      phone: phone,
      session: currentSession,
      campName: campName
    };
  },

  /**
   * Registers a new student and records their attendance in one transaction.
   * @param {object} studentData Input data from the frontend.
   * @returns {object} Success metadata.
   */
  registerAndAttend: function(studentData) {
    var lock = LockService.getScriptLock();
    // Wait up to 30 seconds for lock
    var success = lock.tryLock(30000);
    if (!success) {
      throw new Error("خادم قاعدة البيانات مشغول حالياً، يرجى المحاولة مرة أخرى.");
    }
    
    try {
      var settings = getSettings();
      if ((settings.Attendance || "").toString().toUpperCase() !== "OPEN") {
        throw new Error("تسجيل الحضور مغلق حالياً.");
      }
      
      var phone = this.cleanPhone(studentData.Phone);
      if (!phone || phone.length < 8) {
        throw new Error("يرجى إدخال رقم هاتف صحيح.");
      }
      
      // Check duplicate student
      var existing = DB.getStudentByPhone(phone);
      if (existing) {
        throw new Error("رقم الهاتف هذا مسجل بالفعل باسم: " + (existing["Name AR"] || existing["Name EN"]) + ". يرجى العودة وتسجيل الحضور مباشرة.");
      }
      
      // Validations (Arabic and English Names, minimum 3 names)
      var nameArRegex = /^[\u0600-\u06FF\s]+$/;
      var nameEnRegex = /^[a-zA-Z\s]+$/;
      
      var cleanAr = studentData.NameAr.trim();
      var cleanEn = studentData.NameEn.trim();
      
      if (!cleanAr || !nameArRegex.test(cleanAr) || cleanAr.split(/\s+/).length < 3) {
        throw new Error("الاسم باللغة العربية يجب أن يتكون من حروف عربية فقط ويجب أن يكون ثلاثياً على الأقل.");
      }
      if (!cleanEn || !nameEnRegex.test(cleanEn) || cleanEn.split(/\s+/).length < 3) {
        throw new Error("الاسم باللغة الإنجليزية يجب أن يتكون من حروف إنجليزية فقط ويجب أن يكون ثلاثياً على الأقل.");
      }
      if (!studentData.University || studentData.University.trim().length < 2) {
        throw new Error("يرجى إدخال اسم الجامعة بشكل صحيح.");
      }
      if (!studentData.Email || !this.isValidEmail(studentData.Email.trim())) {
        throw new Error("البريد الإلكتروني المدخل غير صحيح.");
      }
      
      var currentSession = settings.CurrentSession || "1";
      var sessionKey = this.getSessionKey(currentSession);
      
      // Build student record
      var newStudent = {
        "Phone": studentData.Phone.toString().trim(),
        "Name AR": studentData.NameAr.trim(),
        "Name EN": this.toTitleCase(studentData.NameEn.trim()),
        "University": studentData.University.trim(),
        "Email": studentData.Email.trim().toLowerCase()
      };
      
      // Mark current session as True
      newStudent[sessionKey] = true;
      
      // Append student to sheet
      DB.addStudent(newStudent);
      
      // Calculate and update metrics
      this.recalculateStudentMetrics(phone, settings.MinAttendance);
      
      // Log attendance event
      DB.logAttendance(phone, currentSession);
      
      return {
        success: true,
        studentName: newStudent["Name AR"],
        session: currentSession,
        campName: settings.CampName
      };
      
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Submits attendance for an existing student.
   * @param {string} phoneRaw
   * @returns {object} Success metadata.
   */
  submitAttendance: function(phoneRaw) {
    var lock = LockService.getScriptLock();
    var success = lock.tryLock(30000);
    if (!success) {
      throw new Error("خادم قاعدة البيانات مشغول حالياً، يرجى المحاولة مرة أخرى.");
    }
    
    try {
      var settings = getSettings();
      if ((settings.Attendance || "").toString().toUpperCase() !== "OPEN") {
        throw new Error("تسجيل الحضور مغلق حالياً.");
      }
      
      var phone = this.cleanPhone(phoneRaw);
      var student = DB.getStudentByPhone(phone);
      if (!student) {
        throw new Error("الطالب غير مسجل في النظام.");
      }
      
      var currentSession = settings.CurrentSession || "1";
      var sessionKey = this.getSessionKey(currentSession);
      
      var alreadyAttended = student[sessionKey] === true || student[sessionKey] === "TRUE" || student[sessionKey] === "true";
      if (alreadyAttended) {
        return {
          success: true,
          alreadyMarked: true,
          studentName: student["Name AR"] || student["Name EN"],
          session: currentSession,
          campName: settings.CampName
        };
      }
      
      // Mark session as true
      var updates = {};
      updates[sessionKey] = true;
      DB.updateStudentFields(phone, updates);
      
      // Recalculate metrics
      this.recalculateStudentMetrics(phone, settings.MinAttendance);
      
      // Log event
      DB.logAttendance(phone, currentSession);
      
      return {
        success: true,
        studentName: student["Name AR"] || student["Name EN"],
        session: currentSession,
        campName: settings.CampName
      };
      
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Recalculates metrics for a student and updates the sheet.
   * Metrics: Total Attended, Attendance Rate, Certificate Eligible
   * @param {string} phone
   * @param {number} minAttendance
   */
  recalculateStudentMetrics: function(phone, minAttendance) {
    var student = DB.getStudentByPhone(phone);
    if (!student) return;
    
    var totalSessions = 15; // S1 to S15 (S0 is excluded)
    var attendedCount = 0;
    
    // Count True values across S1..S15
    for (var i = 1; i <= totalSessions; i++) {
      var sKey = this.getSessionKey(i);
      var val = student[sKey];
      if (val === true || val === "TRUE" || val === "true") {
        attendedCount++;
      }
    }
    
    var rateValue = totalSessions > 0 ? (attendedCount / totalSessions) : 0;
    // Format as percentage string, e.g., "86.7%"
    var attendanceRateStr = (rateValue * 100).toFixed(1) + "%";
    var eligible = attendedCount >= (minAttendance || 12); // Default to 12 sessions (80% of 15 is 12)
    
    var updates = {
      "Total Attended": attendedCount,
      "Attendance Rate": attendanceRateStr,
      "Certificate Eligible": eligible
    };
    
    DB.updateStudentFields(phone, updates);
  },

  /**
   * Evaluates if a student is eligible to take the active session quiz and their status.
   */
  checkQuizStatus: function(phoneRaw) {
    var settings = getSettings();
    var campName = settings.CampName || "Camp";
    var currentSession = settings.CurrentSession || "0";
    
    if (settings.Quiz === "CLOSED") {
      return {
        status: "CLOSED",
        message: "عذراً، كويز المحاضرة مغلق حالياً من قبل الإدارة."
      };
    }
    
    var phone = this.cleanPhone(phoneRaw);
    if (!phone || phone.length < 8) {
      return {
        status: "INVALID_PHONE",
        message: "يرجى إدخال رقم هاتف صحيح."
      };
    }
    
    var student = DB.getStudentByPhone(phone);
    if (!student) {
      return {
        status: "NOT_REGISTERED",
        message: "رقم الهاتف غير مسجل في الكامب. يرجى تسجيل الحضور أولاً للتسجيل في النظام قبل أداء الكويز."
      };
    }
    
    var grade = DB.getQuizGrade(phone, currentSession);
    if (grade) {
      return {
        status: "ALREADY_TAKEN",
        studentName: student["Name AR"] || student["Name EN"],
        score: grade["Score"],
        total: grade["Total Questions"],
        percentage: grade["Percentage"],
        session: currentSession,
        campName: campName
      };
    }
    
    var questions = DB.getQuizQuestions(currentSession);
    if (questions.length === 0) {
      return {
        status: "NO_QUESTIONS",
        studentName: student["Name AR"] || student["Name EN"],
        session: currentSession,
        campName: campName,
        message: "لا توجد أسئلة مضافة للكويز الخاص بهذه المحاضرة حالياً."
      };
    }
    
    return {
      status: "READY",
      studentName: student["Name AR"] || student["Name EN"],
      session: currentSession,
      campName: campName,
      questionsCount: questions.length
    };
  },

  /**
   * Fetches questions for the current session without correct options for security.
   */
  getQuizQuestionsForSession: function(phoneRaw) {
    var settings = getSettings();
    var currentSession = settings.CurrentSession || "0";
    
    var phone = this.cleanPhone(phoneRaw);
    var student = DB.getStudentByPhone(phone);
    if (!student) {
      throw new Error("رقم الهاتف غير مسجل.");
    }
    
    var questions = DB.getQuizQuestions(currentSession);
    var securedQuestions = questions.map(function(q) {
      return {
        questionId: q["Question ID"],
        questionText: q["Question Text"],
        type: q["Type"],
        optionA: q["Option A"],
        optionB: q["Option B"],
        optionC: q["Option C"],
        optionD: q["Option D"]
      };
    });
    
    return {
      session: currentSession,
      questions: securedQuestions
    };
  },

  /**
   * Submits answers and saves the score inside Google Sheets.
   */
  submitQuizAnswers: function(phoneRaw, answers) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error("خادم تسجيل الإجابات مشغول حالياً. يرجى المحاولة بعد قليل.");
    }
    
    try {
      var settings = getSettings();
      var currentSession = settings.CurrentSession || "0";
      
      var phone = this.cleanPhone(phoneRaw);
      var student = DB.getStudentByPhone(phone);
      if (!student) {
        throw new Error("رقم الهاتف غير مسجل.");
      }
      
      var existingGrade = DB.getQuizGrade(phone, currentSession);
      if (existingGrade) {
        return {
          alreadySubmitted: true,
          score: existingGrade["Score"],
          total: existingGrade["Total Questions"],
          percentage: existingGrade["Percentage"]
        };
      }
      
      var questions = DB.getQuizQuestions(currentSession);
      if (questions.length === 0) {
        throw new Error("لا توجد أسئلة مضافة لتصحيحها.");
      }
      
      var qMap = {};
      for (var i = 0; i < questions.length; i++) {
        var q = questions[i];
        qMap[q["Question ID"].toString().trim()] = q["Correct Option"].toString().trim().toUpperCase();
      }
      
      var score = 0;
      for (var j = 0; j < answers.length; j++) {
        var ans = answers[j];
        var qId = ans.questionId.toString().trim();
        var selected = (ans.selectedOption || "").toString().trim().toUpperCase();
        
        if (qMap.hasOwnProperty(qId) && qMap[qId] === selected) {
          score++;
        }
      }
      
      var nameAr = student["Name AR"] || student["Name EN"] || "";
      var nameEn = student["Name EN"] || "";
      
      DB.saveQuizGrade(phone, nameAr, nameEn, currentSession, score, questions.length);
      
      return {
        success: true,
        score: score,
        total: questions.length,
        percentage: questions.length > 0 ? (score / questions.length) : 0
      };
      
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Verifies if the entered PIN matches the AdminPIN saved in Google Sheets.
   */
  verifyAdminPIN: function(pin) {
    var settings = getSettings();
    var configPin = (settings.AdminPIN || "1234").toString().trim();
    var inputPin = (pin || "").toString().trim();
    if (configPin === inputPin) {
      return { authorized: true };
    } else {
      throw new Error("رمز التحقق الإداري غير صحيح. يرجى المحاولة مرة أخرى.");
    }
  },

  /**
   * Fetches statistics and active configuration settings for the Admin Dashboard.
   */
  getAdminDashboardData: function(pin) {
    this.verifyAdminPIN(pin); // Authorize first
    
    var settings = getSettings();
    var currentSession = settings.CurrentSession || "0";
    var sessionKey = this.getSessionKey(currentSession);
    
    var ss = getActiveSpreadsheet();
    
    // 1. Calculate Registered Students and Attendees
    var studentSheet = ss.getSheetByName(CONFIG.SHEET_STUDENTS);
    var totalRegistered = 0;
    var currentSessionAttendees = 0;
    
    if (studentSheet) {
      var studentLastRow = studentSheet.getLastRow();
      if (studentLastRow > 1) {
        totalRegistered = studentLastRow - 1;
        var studentHeaders = DB.getHeaders(studentSheet);
        var colIdx = studentHeaders.indexOf(sessionKey);
        if (colIdx !== -1) {
          var colValues = studentSheet.getRange(2, colIdx + 1, studentLastRow - 1, 1).getValues();
          for (var r = 0; r < colValues.length; r++) {
            var val = colValues[r][0];
            if (val === true || val === "TRUE" || val === "true") {
              currentSessionAttendees++;
            }
          }
        }
      }
    }
    
    // 2. Calculate Quiz Takers and average score
    var quizSheet = ss.getSheetByName(CONFIG.SHEET_QUIZ_GRADES);
    var currentSessionQuizTakers = 0;
    var quizScoresSum = 0;
    var averageQuizScore = 0;
    
    if (quizSheet) {
      var quizLastRow = quizSheet.getLastRow();
      if (quizLastRow > 1) {
        var quizHeaders = DB.getHeaders(quizSheet);
        var quizData = quizSheet.getRange(2, 1, quizLastRow - 1, quizHeaders.length).getValues();
        var targetSess = currentSession.toString().trim();
        
        for (var q = 0; q < quizData.length; q++) {
          var rowSess = quizData[q][4].toString().trim(); // Session Index
          if (rowSess === targetSess) {
            currentSessionQuizTakers++;
            quizScoresSum += Number(quizData[q][5]); // Score
          }
        }
        if (currentSessionQuizTakers > 0) {
          averageQuizScore = (quizScoresSum / currentSessionQuizTakers).toFixed(1);
        }
      }
    }
    
    return {
      authorized: true,
      settings: {
        CampName: settings.CampName,
        CurrentSession: currentSession.toString(),
        FeedbackSession: (settings.FeedbackSession !== undefined ? settings.FeedbackSession.toString() : currentSession.toString()),
        Attendance: settings.Attendance || "CLOSED",
        Quiz: settings.Quiz || "OPEN",
        Feedback: settings.Feedback || "OPEN",
        MinAttendance: settings.MinAttendance || 12,
        LogoURL: settings.LogoURL || "",
        FacebookURL: settings.FacebookURL || "https://www.facebook.com/profile.php?id=61575638669904",
        AdminPIN: settings.AdminPIN || "1234"
      },
      stats: {
        totalRegistered: totalRegistered,
        currentSessionAttendees: currentSessionAttendees,
        currentSessionQuizTakers: currentSessionQuizTakers,
        averageQuizScore: averageQuizScore
      }
    };
  },

  /**
   * Updates settings and returns the refreshed dashboard data.
   */
  updateAdminSettings: function(pin, updates) {
    this.verifyAdminPIN(pin); // Verify authority
    
    for (var key in updates) {
      if (updates.hasOwnProperty(key)) {
        setSettingValue(key, updates[key]);
      }
    }
    
    SpreadsheetApp.flush();
    return this.getAdminDashboardData(pin);
  },

  /**
   * Checks student registration status and if feedback was already submitted for the current session.
   */
  checkFeedbackStatus: function(phoneRaw) {
    var settings = getSettings();
    var campName = settings.CampName || "Camp";
    var currentSession = (settings.FeedbackSession !== undefined && settings.FeedbackSession !== "") ? 
                          settings.FeedbackSession.toString() : (settings.CurrentSession || "0");
    
    if (settings.Feedback === "CLOSED") {
      return {
        status: "CLOSED",
        message: "عذراً، استبيان تقييم المحاضرة مغلق حالياً من قبل الإدارة."
      };
    }
    
    var phone = this.cleanPhone(phoneRaw);
    if (!phone || phone.length < 8) {
      return {
        status: "INVALID_PHONE",
        message: "يرجى إدخال رقم هاتف صحيح."
      };
    }
    
    var student = DB.getStudentByPhone(phone);
    if (!student) {
      return {
        status: "NOT_REGISTERED",
        message: "رقم الهاتف غير مسجل في الكامب. يرجى تسجيل الحضور أولاً للتسجيل في النظام قبل أداء التقييم."
      };
    }
    
    var existingFeedback = DB.getFeedbackResponse(phone, currentSession);
    if (existingFeedback) {
      return {
        status: "ALREADY_SUBMITTED",
        studentName: student["Name AR"] || student["Name EN"],
        session: currentSession,
        campName: campName
      };
    }
    
    return {
      status: "READY",
      studentName: student["Name AR"] || student["Name EN"],
      session: currentSession,
      campName: campName
    };
  },

  /**
   * Submits a student's feedback response and saves it in the Feedback Responses sheet.
   */
  submitFeedbackAnswers: function(phoneRaw, answers) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error("خادم تسجيل التقييمات مشغول حالياً. يرجى المحاولة بعد قليل.");
    }
    
    try {
      var settings = getSettings();
      var currentSession = (settings.FeedbackSession !== undefined && settings.FeedbackSession !== "") ? 
                            settings.FeedbackSession.toString() : (settings.CurrentSession || "0");
      
      var phone = this.cleanPhone(phoneRaw);
      var student = DB.getStudentByPhone(phone);
      if (!student) {
        throw new Error("رقم الهاتف غير مسجل.");
      }
      
      var existingFeedback = DB.getFeedbackResponse(phone, currentSession);
      if (existingFeedback) {
        return {
          alreadySubmitted: true
        };
      }
      
      var nameAr = student["Name AR"] || student["Name EN"] || "";
      DB.saveFeedbackResponse(phone, nameAr, currentSession, answers);
      
      return {
        success: true
      };
      
    } finally {
      lock.releaseLock();
    }
  }
};
