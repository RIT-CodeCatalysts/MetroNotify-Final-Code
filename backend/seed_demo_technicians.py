"""Plan technician coverage in every category (read-only, no Firebase writes).

The old version created fake @example.com Firebase accounts. Those users
couldn't receive verification/password-reset emails, so that unsafe demo
provisioning has deliberately been removed. Invite real staff individually
through the secured Admin portal, or use provision_technicians_csv.py.
"""

COVERAGE = {
    "Electricity": "electrical", "Water": "plumbing",
    "Sewerage": "plumbing", "Potholes": "civil",
    "Vandalism": "security", "Streetlights": "electrical",
    "Waste / Refuse": "waste", "Stormwater": "civil",
    "Traffic Lights": "traffic", "Other": "general",
}

if __name__ == "__main__":
    print("Recommended staffing (plan only; no Firebase accounts created):")
    for category, specialization in COVERAGE.items():
        print(f"  {category}: 2 technicians trained in {specialization}")
    print("Invite real staff using Admin > Add Technician, or the CSV provisioning tool.")
