package uk.dentsuite.dentstaff;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/v1/info")
@Produces(MediaType.APPLICATION_JSON)
public class ServiceInfoResource {
    @GET
    public ServiceInfo getInfo() {
        return new ServiceInfo("Den Staff", "ready");
    }

    public record ServiceInfo(String service, String status) {
    }
}
