from utils.duplicate_detector import check_duplicate

description = "No power since 6am"

if check_duplicate(description):
    print("Duplicate report found.")
else:
    print("New report.")