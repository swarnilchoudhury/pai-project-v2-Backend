const adminRole = (req) => {
    try {
        if (req != null && req != undefined) {
            return req.Role.trim().toUpperCase() === "ADMIN";
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