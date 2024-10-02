const adminRole = (req) => {
    try {
        if (req != null && req != undefined) {
            return req.Role.trim().toUpperCase() === "ADMIN"; // IF ADMIN, then return true
        }
        else {
            return false;
        }
    }
    catch {
        return false;
    }
};

module.exports = { adminRole }