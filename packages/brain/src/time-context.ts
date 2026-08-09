/**
 * Current-time grounding for the model. Without this the model has no idea what
 * "today" or "tomorrow" means and starts asking the caller for the date.
 */

const ZONE_AREA_CODES: Array<[string, string[]]> = [
  [
    'America/New_York',
    [
      // CT, DC, DE, ME, MD, MA, NH, NJ, NY, PA, RI, VT
      '203', '475', '860', '959', '202', '302', '207', '227', '240', '301',
      '410', '443', '667', '339', '351', '413', '508', '617', '774', '781',
      '857', '978', '603', '201', '551', '609', '640', '732', '848', '856',
      '862', '908', '973', '212', '315', '332', '347', '363', '516', '518',
      '585', '607', '631', '646', '680', '716', '718', '838', '845', '914',
      '917', '929', '934', '215', '223', '267', '272', '412', '445', '484',
      '570', '582', '610', '717', '724', '814', '835', '878', '401', '802',
      // FL (eastern), GA, NC, SC, VA, WV, OH, IN, MI, eastern KY/TN
      '239', '305', '321', '352', '386', '407', '448', '561', '656', '689',
      '727', '754', '772', '786', '813', '863', '904', '941', '954', '229',
      '404', '470', '478', '678', '706', '762', '770', '912', '943', '252',
      '336', '704', '743', '828', '910', '919', '980', '984', '803', '839',
      '843', '854', '864', '276', '434', '540', '571', '686', '703', '757',
      '804', '826', '948', '304', '681', '216', '220', '234', '326', '330',
      '380', '419', '440', '513', '567', '614', '740', '937', '219', '260',
      '317', '463', '574', '765', '812', '930', '231', '248', '269', '313',
      '517', '586', '616', '679', '734', '810', '906', '947', '989', '502',
      '606', '859', '423',
    ],
  ],
  [
    'America/Chicago',
    [
      // AL, AR, IL, IA, KS, LA, MN, MS, MO, NE, ND, OK, SD, TN, TX, WI
      '205', '251', '256', '334', '659', '938', '327', '479', '501', '870',
      '217', '224', '309', '312', '331', '447', '464', '618', '630', '708',
      '730', '773', '779', '815', '847', '872', '319', '515', '563', '641',
      '712', '316', '620', '785', '913', '225', '318', '337', '504', '985',
      '218', '320', '507', '612', '651', '763', '952', '228', '601', '662',
      '769', '235', '314', '417', '557', '573', '636', '660', '816', '402',
      '531', '701', '405', '539', '572', '580', '918', '605', '615', '629',
      '731', '865', '901', '931', '210', '214', '254', '281', '325', '346',
      '361', '409', '430', '432', '469', '512', '682', '713', '726', '737',
      '806', '817', '830', '832', '903', '936', '940', '945', '956', '972',
      '979', '262', '274', '414', '534', '608', '715', '920', '270', '364',
      '850',
    ],
  ],
  [
    'America/Denver',
    [
      // CO, ID, MT, NM, UT, WY, western NE, El Paso
      '303', '719', '720', '970', '983', '208', '986', '406', '505', '575',
      '385', '435', '801', '307', '308', '915',
    ],
  ],
  ['America/Phoenix', ['480', '520', '602', '623', '928']],
  [
    'America/Los_Angeles',
    [
      // CA, NV, OR, WA
      '209', '213', '279', '310', '323', '341', '350', '408', '415', '424',
      '442', '510', '530', '559', '562', '619', '626', '628', '650', '657',
      '661', '669', '707', '714', '747', '749', '760', '805', '818', '820',
      '831', '837', '840', '858', '909', '916', '925', '949', '951', '702',
      '725', '775', '458', '503', '541', '971', '206', '253', '360', '425',
      '509', '564',
    ],
  ],
  ['America/Anchorage', ['907']],
  ['Pacific/Honolulu', ['808']],
];

const AREA_CODE_TIMEZONES = new Map<string, string>(
  ZONE_AREA_CODES.flatMap(([zone, codes]) =>
    codes.map((code) => [code, zone] as [string, string]),
  ),
);

export function areaCodeFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const national =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return national.slice(0, 3);
}

export function timezoneFromPhone(phone: string | null | undefined): string | null {
  const areaCode = areaCodeFromPhone(phone);
  if (!areaCode) return null;
  return AREA_CODE_TIMEZONES.get(areaCode) ?? null;
}

function formatInZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(date);
}

/** YYYY-MM-DD as seen in the given timezone. */
function isoDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatSlotLabel(date: Date, timeZone: string): string {
  return formatInZone(date, timeZone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export interface TimeContextOptions {
  businessTimezone: string;
  callerPhone?: string | null;
  now?: Date;
}

export function buildTimeContext(options: TimeContextOptions): string {
  const now = options.now ?? new Date();
  const timeZone = options.businessTimezone || 'America/New_York';
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);

  const todayLong = formatInZone(now, timeZone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const nowTime = formatInZone(now, timeZone, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const tomorrowLong = formatInZone(tomorrow, timeZone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const callerZone = timezoneFromPhone(options.callerPhone);
  const areaCode = areaCodeFromPhone(options.callerPhone);

  let callerLine: string;
  if (callerZone && callerZone === timeZone) {
    callerLine = `The caller's area code (${areaCode}) is in ${timeZone}, the same timezone as the business. Use local times without asking.`;
  } else if (callerZone) {
    callerLine = `The caller's area code (${areaCode}) is in ${callerZone}, which differs from the business timezone. State times in the business timezone and name the timezone once so there is no confusion.`;
  } else {
    callerLine =
      'Caller timezone is unknown. Assume the business timezone unless the caller says otherwise. Do not ask them for it.';
  }

  return [
    '## Current date and time',
    '',
    `Right now it is ${todayLong} at ${nowTime} in ${timeZone} (business timezone).`,
    `Today is ${isoDateInZone(now, timeZone)}. Tomorrow is ${tomorrowLong}, ${isoDateInZone(tomorrow, timeZone)}.`,
    callerLine,
    'Resolve relative dates such as "tomorrow", "next Tuesday", "this afternoon", or "next week" yourself from the date above.',
    'Never ask the caller what today\'s date is, what year it is, or what timezone they are in.',
    'Speak times in plain spoken form such as "Monday at ten in the morning". Never read ISO timestamps, UTC offsets, or timezone identifiers aloud.',
  ].join('\n');
}
