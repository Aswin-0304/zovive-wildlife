package com.wildlife;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wildlife.entity.UserAccount;
import com.wildlife.entity.UserRole;
import com.wildlife.repository.UserAccountRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.security.SecureRandom;
import java.util.Base64;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthenticationIntegrationTest {
    private static final String PASSWORD = "A-Strong-Test-Password-2026";
    private static final String TEST_JWT_SECRET = createTestSecret();

    @DynamicPropertySource
    static void securityTestProperties(DynamicPropertyRegistry properties) {
        properties.add("app.security.jwt-secret", () -> TEST_JWT_SECRET);
        properties.add("app.security.cookie-secure", () -> false);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserAccountRepository users;
    @Autowired PasswordEncoder passwordEncoder;

    @BeforeEach
    void seedAccounts() {
        users.deleteAll();
        createUser("field-admin", "admin@example.test", UserRole.ADMIN);
        createUser("field-officer", "officer@example.test", UserRole.FOREST_OFFICER);
    }

    @Test
    void validLoginUsesHttpOnlyCookieAndExposesNoTokenOrPassword() throws Exception {
        Csrf csrf = csrf();
        MvcResult result = mvc.perform(post("/api/auth/login")
                        .cookie(csrf.cookie)
                        .header("X-XSRF-TOKEN", csrf.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", "admin@example.test", "password", PASSWORD, "rememberMe", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.username").value("field-admin"))
                .andExpect(jsonPath("$.user.role").value("ADMIN"))
                .andExpect(jsonPath("$.token").doesNotExist())
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andReturn();

        String setCookie = result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith("ZOVIVE_AUTH=")).findFirst().orElseThrow();
        org.junit.jupiter.api.Assertions.assertTrue(setCookie.contains("HttpOnly"));
        org.junit.jupiter.api.Assertions.assertTrue(setCookie.contains("SameSite=Strict"));
        org.junit.jupiter.api.Assertions.assertTrue(setCookie.contains("Max-Age=604800"));
        org.junit.jupiter.api.Assertions.assertFalse(setCookie.contains(PASSWORD));
    }

    @Test
    void invalidLoginReturnsGenericMessageAndProtectedApiRejectsAnonymous() throws Exception {
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", "field-admin", "password", PASSWORD, "rememberMe", false))))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/login")
                        .cookie(csrf.cookie).header("X-XSRF-TOKEN", csrf.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", "unknown@example.test", "password", "wrong-password", "rememberMe", false))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message", containsString("Invalid username/email or password")));
        mvc.perform(get("/api/dashboard/stats")).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesTheTokenAndOfficerCannotUseAdminRoutes() throws Exception {
        Login officer = login("field-officer", false);
        mvc.perform(get("/api/auth/me").cookie(officer.authCookie))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("FOREST_OFFICER"));
        mvc.perform(get("/api/admin/users").cookie(officer.authCookie)).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/users").cookie(officer.authCookie, officer.csrf.cookie)
                        .header("X-XSRF-TOKEN", officer.csrf.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"new-officer\",\"email\":\"new-officer@example.test\",\"password\":\"A-Strong-Test-Password-2026\",\"role\":\"FOREST_OFFICER\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").cookie(officer.authCookie, officer.csrf.cookie)
                        .header("X-XSRF-TOKEN", officer.csrf.token))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));
        mvc.perform(get("/api/auth/me").cookie(officer.authCookie)).andExpect(status().isUnauthorized());

        Login admin = login("field-admin", false);
        mvc.perform(get("/api/admin/users").cookie(admin.authCookie))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].role").exists());
        mvc.perform(post("/api/admin/users").cookie(admin.authCookie, admin.csrf.cookie)
                        .header("X-XSRF-TOKEN", admin.csrf.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"new-officer\",\"email\":\"new-officer@example.test\",\"password\":\"A-Strong-Test-Password-2026\",\"role\":\"FOREST_OFFICER\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("FOREST_OFFICER"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void staleOrRevokedCookieNeverBlocksCsrfLoginOrLogout() throws Exception {
        // A cookie signed with another key (e.g. before a backend restart) and a cookie already revoked by logout.
        Cookie foreign = new Cookie("ZOVIVE_AUTH", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaWVsZC1hZG1pbiIsImlzcyI6Inpvdml2ZS1hcGkifQ.c2lnbmVkLXdpdGgtYW4tb2xkLWtleQ");
        foreign.setPath("/api");
        Login session = login("field-officer", false);
        mvc.perform(post("/api/auth/logout").cookie(session.authCookie, session.csrf.cookie).header("X-XSRF-TOKEN", session.csrf.token))
                .andExpect(status().isNoContent());

        for (Cookie stale : new Cookie[]{foreign, session.authCookie}) {
            MvcResult csrfResult = mvc.perform(get("/api/auth/csrf").cookie(stale)).andExpect(status().isOk()).andReturn();
            Csrf csrf = new Csrf(mapper.readTree(csrfResult.getResponse().getContentAsString()).get("token").asText(),
                    csrfResult.getResponse().getCookie("XSRF-TOKEN"));
            // Logout still answers 204 and expires the cookie, even though the token is invalid.
            mvc.perform(post("/api/auth/logout").cookie(stale, csrf.cookie).header("X-XSRF-TOKEN", csrf.token))
                    .andExpect(status().isNoContent())
                    .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));
            // Correct credentials still sign in while the stale cookie is present.
            mvc.perform(post("/api/auth/login").cookie(stale, csrf.cookie).header("X-XSRF-TOKEN", csrf.token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(Map.of("identifier", "field-admin", "password", PASSWORD, "rememberMe", false))))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.user.username").value("field-admin"));
            // Protected routes still reject the stale token, and logout still requires the CSRF token.
            mvc.perform(get("/api/auth/me").cookie(stale)).andExpect(status().isUnauthorized());
            mvc.perform(post("/api/auth/logout").cookie(stale)).andExpect(status().isForbidden());
        }
    }

    @Test
    void forestOfficerCanUseExistingMonitoringAndCrudApis() throws Exception {
        Login officer = login("field-officer", false);
        Cookie[] authAndCsrf = {officer.authCookie, officer.csrf.cookie};
        String csrfHeader = officer.csrf.token;

        mvc.perform(get("/api/dashboard/stats").cookie(officer.authCookie)).andExpect(status().isOk());
        mvc.perform(get("/api/detections").cookie(officer.authCookie)).andExpect(status().isOk());
        mvc.perform(get("/api/cameras").cookie(officer.authCookie)).andExpect(status().isOk());
        mvc.perform(get("/api/alerts").cookie(officer.authCookie)).andExpect(status().isOk());

        String detection = "{\"species\":\"Wolf\",\"confidence\":91.5,\"location\":\"West Ridge\",\"detectedAt\":\"2026-11-07T12:30:00\"}";
        MvcResult createdDetection = mvc.perform(post("/api/detections").cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(detection))
                .andExpect(status().isCreated()).andReturn();
        long detectionId = mapper.readTree(createdDetection.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(put("/api/detections/{id}", detectionId).cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(detection.replace("Wolf", "Fox")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.species").value("Fox"));
        mvc.perform(delete("/api/detections/{id}", detectionId).cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader))
                .andExpect(status().isNoContent());

        String camera = "{\"cameraName\":\"Test camera\",\"location\":\"East Ridge\",\"status\":\"ACTIVE\"}";
        MvcResult createdCamera = mvc.perform(post("/api/cameras").cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(camera))
                .andExpect(status().isCreated()).andReturn();
        long cameraId = mapper.readTree(createdCamera.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(put("/api/cameras/{id}", cameraId).cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(camera.replace("ACTIVE", "INACTIVE")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INACTIVE"));
        mvc.perform(delete("/api/cameras/{id}", cameraId).cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader))
                .andExpect(status().isNoContent());

        MvcResult createdAlert = mvc.perform(post("/api/alerts").cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"alertType\":\"Test movement\",\"detectionId\":null}"))
                .andExpect(status().isCreated()).andReturn();
        long alertId = mapper.readTree(createdAlert.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(put("/api/alerts/{id}", alertId).cookie(authAndCsrf).header("X-XSRF-TOKEN", csrfHeader)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"RESOLVED\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RESOLVED"));
    }

    private void createUser(String username, String email, UserRole role) {
        UserAccount user = new UserAccount();
        user.setUsername(username); user.setEmail(email); user.setPasswordHash(passwordEncoder.encode(PASSWORD));
        user.setRole(role); user.setEnabled(true); users.save(user);
    }

    private static String createTestSecret() {
        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        return Base64.getEncoder().encodeToString(secret);
    }

    private Csrf csrf() throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        JsonNode json = mapper.readTree(result.getResponse().getContentAsString());
        return new Csrf(json.get("token").asText(), result.getResponse().getCookie("XSRF-TOKEN"));
    }

    private Login login(String identifier, boolean rememberMe) throws Exception {
        Csrf csrf = csrf();
        MvcResult result = mvc.perform(post("/api/auth/login").cookie(csrf.cookie).header("X-XSRF-TOKEN", csrf.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("identifier", identifier, "password", PASSWORD, "rememberMe", rememberMe))))
                .andExpect(status().isOk()).andReturn();
        String setCookie = result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith("ZOVIVE_AUTH=")).findFirst().orElseThrow();
        Cookie authCookie = new Cookie("ZOVIVE_AUTH", setCookie.substring("ZOVIVE_AUTH=".length(), setCookie.indexOf(';')));
        authCookie.setPath("/api");
        return new Login(authCookie, csrf);
    }

    private record Csrf(String token, Cookie cookie) { }
    private record Login(Cookie authCookie, Csrf csrf) { }
}
