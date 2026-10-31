/** Navigation param lists for the candidate app's nested stacks. */

export type CandidateTabParamList = {
  Home: undefined;
  Roles: undefined;
  AI: undefined;
  Hours: undefined;
  Profile: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Messages: undefined;
  Notifications: undefined;
  Travel: undefined;
  Bookings: undefined;
};

export type HoursStackParamList = {
  HoursMain: undefined;
  AddHours: undefined;
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  ProfileEdit: undefined;
  Vetting: undefined;
  Documents: undefined;
  Availability: undefined;
  Declarations: undefined;
  WorkerDocuments: undefined;
  Payroll: undefined;
  Payment: undefined;
  DocumentCapture: { docType: string; label: string; mode: 'single' | 'card' | 'selfie' };
  DrivingLicence: undefined;
};
