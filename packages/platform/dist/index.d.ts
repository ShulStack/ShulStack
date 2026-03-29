declare const DEFAULT_DATABASE_URL = "postgres://shulstack:shulstack@127.0.0.1:5432/shulstack";
declare const MODULES: readonly [{
    readonly slug: "crm";
    readonly label: "CRM Core";
}, {
    readonly slug: "finance";
    readonly label: "Finance Core";
}, {
    readonly slug: "calendar";
    readonly label: "Calendar Core";
}, {
    readonly slug: "cms";
    readonly label: "CMS";
}, {
    readonly slug: "member-portal";
    readonly label: "Member Portal";
}, {
    readonly slug: "events";
    readonly label: "Events";
}, {
    readonly slug: "communications";
    readonly label: "Communications";
}, {
    readonly slug: "fundraising";
    readonly label: "Fundraising";
}, {
    readonly slug: "yahrzeits";
    readonly label: "Yahrzeits";
}, {
    readonly slug: "seating";
    readonly label: "Seating";
}, {
    readonly slug: "school";
    readonly label: "School";
}, {
    readonly slug: "ritual";
    readonly label: "Ritual";
}, {
    readonly slug: "cemetery";
    readonly label: "Cemetery";
}, {
    readonly slug: "reporting";
    readonly label: "Reporting";
}];
type ModuleSlug = (typeof MODULES)[number]["slug"];
declare const PROVIDERS: {
    readonly email: "local-smtp";
    readonly payments: "stripe";
    readonly storage: "local-disk";
    readonly imports: "csv";
};

export { DEFAULT_DATABASE_URL, MODULES, type ModuleSlug, PROVIDERS };
