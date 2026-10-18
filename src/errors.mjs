export class AstoraError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export const messages = {
  INVALID_URL: 'الرابط غير صالح. استخدم رابط HTTP أو HTTPS كاملًا.',
  PRIVATE_ADDRESS: 'هذا الإصدار يفحص المصادر العامة فقط. العنوان يشير إلى شبكة خاصة.',
  HTTPS_DOWNGRADE: 'المصدر يحاول الانتقال من HTTPS إلى HTTP. أُوقف الاتصال.',
  REDIRECT_LIMIT: 'المصدر يعيد التوجيه مرات كثيرة.',
  AUTH_REQUIRED: 'المصدر يطلب تسجيل الدخول أو يمنع الوصول إلى الملف.',
  NOT_FOUND: 'الملف غير موجود في هذا المصدر.',
  RATE_LIMIT: 'المصدر يحدّ الطلبات مؤقتًا. حاول لاحقًا.',
  HTTP_ERROR: 'خادم المصدر أعاد استجابة غير ناجحة.',
  NETWORK_ERROR: 'تعذر الاتصال بالمصدر. تحقق من الشبكة ثم أعد المحاولة.',
  TIMEOUT: 'انتهت مهلة استجابة المصدر.',
  HTML_PAGE: 'الرابط يعيد صفحة ويب، وليس ملف تثبيت مباشرًا.',
  ARCHIVE: 'الرابط يعيد ملفًا مضغوطًا. فك الضغط غير متاح في هذا الإصدار.',
  EMPTY_FILE: 'المصدر أعاد بيانات فارغة أو أصفارًا بدل ملف التثبيت.',
  INVALID_PACKAGE: 'لم نتعرف على ترويسة حزمة PS4 صالحة.',
  TITLE_MISMATCH: 'معرّف الحزمة لا يطابق معرّف التطبيق في القائمة.',
  KIND_MISMATCH: 'الحزمة تحديث أو إضافة، ونوعها لا يطابق وصف القائمة.',
  SIZE_MISMATCH: 'حجم الملف لا يطابق حجم الحزمة المتوقع.',
  RANGE_INVALID: 'المصدر أعاد جزءًا غير متوقع من الملف.',
  HASH_MISMATCH: 'بصمة الملف لا تطابق البصمة المنشورة. لم يُعتمد الملف.',
  SOURCE_CHANGED: 'تغير الملف على المصدر. يلزم بدء تنزيل جديد.',
  NO_RESUME: 'المصدر لا يسمح باستكمال آمن لهذا التنزيل. ابدأ تنزيلًا جديدًا.',
  TOO_LARGE: 'قائمة المصدر أكبر من الحد المسموح.',
  CATALOG_INVALID: 'صيغة قائمة المصدر غير صحيحة.',
  DISK_SPACE: 'المساحة المتاحة لا تكفي لتنزيل الملف.',
  BUSY: 'يوجد تنزيل نشط. انتظر اكتماله أو أوقفه مؤقتًا.',
  NOT_READY: 'هذه العملية غير متاحة لحالة التنزيل الحالية.',
  IO_ERROR: 'تعذر حفظ الملف على القرص.',
  UNSUPPORTED_PLATFORM: 'فحص الحزم يدعم حاويات PS4 فقط في هذا الإصدار.'
};

export function publicError(error) {
  const code = Object.hasOwn(messages, error?.code) ? error.code : 'NETWORK_ERROR';
  // Never return raw exception strings: URLs may contain signed access tokens.
  const detail = {};
  for (const key of ['status', 'expectedTitleId', 'actualTitleId', 'detectedKind']) {
    if (error?.detail?.[key] !== undefined) detail[key] = error.detail[key];
  }
  return { code, message: messages[code], ...detail };
}
