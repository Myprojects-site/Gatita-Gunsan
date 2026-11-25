/* 앱에서 쓰는 고정 정보. 좌표는 지도에서 대략 잡은 값이라 실제 위치와 수십~수백 m 다를 수 있습니다.
   여기 숫자만 고치면 화면 전체가 따라 바뀝니다. */

const CAMPUS = { name: '국립군산대학교', lat: 35.9450, lng: 126.6822 };

/* 동네 인증에 쓰는 군산 동네 중심점 (대략) */
const DONGS = [
  { name: '미룡동', lat: 35.9440, lng: 126.6850 },
  { name: '지곡동', lat: 35.9545, lng: 126.6985 },
  { name: '나운동', lat: 35.9655, lng: 126.6930 },
  { name: '수송동', lat: 35.9680, lng: 126.7150 },
  { name: '조촌동', lat: 35.9600, lng: 126.7350 },
  { name: '경암동', lat: 35.9790, lng: 126.7290 },
  { name: '구암동', lat: 35.9850, lng: 126.7200 },
  { name: '삼학동', lat: 35.9790, lng: 126.7020 },
  { name: '월명동', lat: 35.9870, lng: 126.7080 },
  { name: '소룡동', lat: 35.9730, lng: 126.6460 },
  { name: '산북동', lat: 35.9600, lng: 126.6600 },
  { name: '개정동', lat: 35.9450, lng: 126.7600 },
];
const DONG_MAX_KM = 4;          // 가장 가까운 동네 중심에서 이 거리 안이어야 인증
const DONG_VALID_DAYS = 30;     // 동네 인증 유지 기간

/* 카풀 목적지 빠른 선택 */
const PLACES = [
  { label: '군산대 정문', lat: 35.9437, lng: 126.6850 },
  { label: '군산대 생활관', lat: 35.9490, lng: 126.6770 },
  { label: '군산대 중앙도서관', lat: 35.9461, lng: 126.6808 },
  { label: '군산고속버스터미널', lat: 35.9779, lng: 126.7232 },
  { label: '군산역', lat: 35.9893, lng: 126.7430 },
];

/* 카풀 금액 계산 기준 (운전자가 글 올릴 때 추천값으로만 쓰고, 직접 고칠 수 있음) */
const FARE = {
  fuelPerKm: 140,        // 1km당 기름값 (휘발유 1,680원/L, 연비 12km/L 기준)
  roadFactor: 1.3,       // 직선거리 → 도로거리 보정
  minFare: 2000,          // 1인 최소 금액
  defaultDeposit: 1000,  // 예약금 기본값 (요금에 포함)
  cancelFreeMin: 60,     // 출발 60분 전까지 취소하면 예약금 돌려받음
};

/* 매너온도 규칙: 아무나 함부로 올리고 내리지 못하게 */
const MANNER = {
  base: 36.5,
  good: 0.2,          // 좋아요 1건
  bad: -0.5,          // 별로예요 1건
  perPairDays: 30,    // 같은 사람이 같은 사람을 평가하면 30일 안에서는 마지막 1건만 반영
  perPairCap: 1.0,    // 한 사람이 다른 한 사람에게 줄 수 있는 총 변화량 한도(±)
  newbieDays: 3,      // 가입 3일 이내 계정이 한 평가는 절반만 반영
  goodTags: ['시간 약속을 잘 지켜요', '친절해요', '안전하게 운전해요', '차가 깨끗해요', '정산이 빨라요'],
  badTags: ['약속 시간에 늦었어요', '연락이 안 됐어요', '운전이 불안했어요', '정산을 안 했어요'],
};

/* 통학버스
   - stops[].min: 첫 정류장에서 그 정류장까지 걸리는 분
   - trips: 출발 시각과 방향(to=군산대 방향, from=군산대 출발)
   - straight: true면 도로 경로를 찾지 않고 정류장끼리 바로 잇는다(교내) */
const BUS_ROUTES = [
  {
    id: 'jeonju', name: '전주', kind: 'out', color: '#2f6fd6',
    stops: [
      { name: '전주역', lat: 35.8497, lng: 127.1617, min: 0 },
      { name: '전북대 정문', lat: 35.8457, lng: 127.1290, min: 14 },
      { name: '서신동', lat: 35.8310, lng: 127.1170, min: 24 },
      { name: '군산대 정문', lat: 35.9437, lng: 126.6850, min: 70 },
    ],
    trips: [
      { at: '07:00', dir: 'to' }, { at: '07:40', dir: 'to' },
      { at: '17:10', dir: 'from' }, { at: '18:20', dir: 'from' },
    ],
  },
  {
    id: 'iksan', name: '익산', kind: 'out', color: '#7a4fd0',
    stops: [
      { name: '원광대', lat: 35.9680, lng: 126.9570, min: 0 },
      { name: '익산터미널', lat: 35.9520, lng: 126.9590, min: 8 },
      { name: '익산역', lat: 35.9403, lng: 126.9460, min: 15 },
      { name: '군산대 정문', lat: 35.9437, lng: 126.6850, min: 52 },
    ],
    trips: [
      { at: '07:20', dir: 'to' }, { at: '08:00', dir: 'to' },
      { at: '17:10', dir: 'from' }, { at: '18:20', dir: 'from' },
    ],
  },
  {
    id: 'city', name: '군산 시내', kind: 'out', color: '#1f9d55',
    stops: [
      { name: '군산역', lat: 35.9893, lng: 126.7430, min: 0 },
      { name: '고속버스터미널', lat: 35.9779, lng: 126.7232, min: 9 },
      { name: '수송동', lat: 35.9680, lng: 126.7150, min: 16 },
      { name: '나운동', lat: 35.9655, lng: 126.6930, min: 23 },
      { name: '군산대 정문', lat: 35.9437, lng: 126.6850, min: 33 },
    ],
    trips: [
      { at: '07:40', dir: 'to' }, { at: '08:10', dir: 'to' }, { at: '08:40', dir: 'to' }, { at: '12:10', dir: 'to' },
      { at: '13:00', dir: 'from' }, { at: '16:10', dir: 'from' }, { at: '17:10', dir: 'from' }, { at: '18:10', dir: 'from' },
    ],
  },
  {
    id: 'loop', name: '교내 순환', kind: 'campus', color: '#f5a524', straight: true,
    stops: [
      { name: '정문', lat: 35.9437, lng: 126.6850, min: 0 },
      { name: '대학본부', lat: 35.9452, lng: 126.6826, min: 2 },
      { name: '중앙도서관', lat: 35.9461, lng: 126.6808, min: 3 },
      { name: '공과대학', lat: 35.9475, lng: 126.6790, min: 5 },
      { name: '생활관', lat: 35.9490, lng: 126.6770, min: 7 },
    ],
    every: { first: '08:40', last: '18:40', min: 10, dir: 'to' },
  },
];

const NOTICES = [
  { tag: '카풀', title: '카풀은 동네 인증 후 이용할 수 있어요', body: '현재 위치로 동네를 인증하면 내 주변 카풀만 보여요. 인증은 30일 동안 유지돼요.' },
  { tag: '안전', title: '탈 때는 꼭 QR로 탑승 인증', body: '운전자가 보여주는 QR을 찍어야 탑승이 기록되고, 탑승이 기록된 사람끼리만 매너온도를 평가할 수 있어요.' },
  { tag: '통학버스', title: '통학버스 위치는 시간표 기준이에요', body: '프로토타입에서는 버스 위치를 시간표로 계산해 보여줘요. 실제 차량 GPS와 연결하면 실시간 위치로 바뀌어요.' },
];
